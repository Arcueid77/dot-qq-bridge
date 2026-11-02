# CI-only process setup. Keep production owner/DACL validation unchanged.
# Elevated hosted runners can default new files to the Administrators group.
# Model the final service user's ownership for this test process and restore it.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class DotBridgeCiOwner {
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool OpenProcessToken(IntPtr process, UInt32 access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, int size, out int needed);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool SetTokenInformation(IntPtr token, int kind, IntPtr data, int size);
  [DllImport("advapi32.dll")] public static extern bool EqualSid(IntPtr left, IntPtr right);
  public static IntPtr ReadInfo(IntPtr token, int kind, out int length) {
    GetTokenInformation(token, kind, IntPtr.Zero, 0, out length);
    if (length <= 0) throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr data = Marshal.AllocHGlobal(length);
    if (!GetTokenInformation(token, kind, data, length, out length)) {
      int code = Marshal.GetLastWin32Error(); Marshal.FreeHGlobal(data);
      throw new Win32Exception(code);
    }
    return data;
  }
  public static void SetOwner(IntPtr token, IntPtr data, int length) {
    if (!SetTokenInformation(token, 4, data, length))
      throw new Win32Exception(Marshal.GetLastWin32Error());
  }
}
'@
$ciToken = [IntPtr]::Zero
$ciUser = [IntPtr]::Zero
$ciOriginalOwner = [IntPtr]::Zero
$ciReplacement = [IntPtr]::Zero
$ciOwnerChanged = $false
$ciTestExit = 1
try {
  if (![DotBridgeCiOwner]::OpenProcessToken([DotBridgeCiOwner]::GetCurrentProcess(), 0x88, [ref]$ciToken)) {
    throw 'Unable to open the CI process token for test ownership setup'
  }
  $ciUserSize = 0
  $ciOwnerSize = 0
  $ciUser = [DotBridgeCiOwner]::ReadInfo($ciToken, 1, [ref]$ciUserSize)
  $ciOriginalOwner = [DotBridgeCiOwner]::ReadInfo($ciToken, 4, [ref]$ciOwnerSize)
  $ciUserSid = [Runtime.InteropServices.Marshal]::ReadIntPtr($ciUser)
  $ciOwnerSid = [Runtime.InteropServices.Marshal]::ReadIntPtr($ciOriginalOwner)
  $ciMatches = [DotBridgeCiOwner]::EqualSid($ciUserSid, $ciOwnerSid)
  Write-Output ('CI default file owner matches current user before setup: ' + $ciMatches)
  if (!$ciMatches) {
    $ciReplacement = [Runtime.InteropServices.Marshal]::AllocHGlobal([IntPtr]::Size)
    [Runtime.InteropServices.Marshal]::WriteIntPtr($ciReplacement, $ciUserSid)
    [DotBridgeCiOwner]::SetOwner($ciToken, $ciReplacement, [IntPtr]::Size)
    $ciOwnerChanged = $true
  }
  & npm.cmd test
  $ciTestExit = $LASTEXITCODE
} finally {
  try {
    if ($ciOwnerChanged) {
      [DotBridgeCiOwner]::SetOwner($ciToken, $ciOriginalOwner, $ciOwnerSize)
      Write-Output 'CI process default file owner restored'
    }
  } finally {
    foreach ($ciBuffer in @($ciReplacement, $ciOriginalOwner, $ciUser)) {
      if ($ciBuffer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($ciBuffer) }
    }
    if ($ciToken -ne [IntPtr]::Zero) { [void][DotBridgeCiOwner]::CloseHandle($ciToken) }
  }
}
exit $ciTestExit
