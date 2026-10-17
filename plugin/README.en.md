# Plugin connection templates

[简体中文](README.md) | [English](README.en.md) | [Home](../README.en.md)

After the voice update, refresh the existing connection's tool catalog and confirm `get_qq_attachment` is available. For a voice event, read metadata with `get_qq_message`, then listen through `get_qq_attachment`. If audio fails, use QQ's reference transcription when available; otherwise ask the sender to resend or use text. Reply through the existing `reply_to_qq`, without creating another subscription. Voice and transcription never authorize unrelated external actions.

When the host omits audio, read the tool's `extracted_text`. The VPS can transcribe locally. Try the attachment tool before declaring voice unreadable; ask for another recording only when no usable content is returned.

These are manual connection templates; `.invalid` addresses are placeholders. Parsing the JSON does not mean a plugin is installed or published. Keep the operator's original dot and official Secure MCP Tunnel, and use [Deployment](../docs/deployment.en.md) to configure the actual target and one event subscription.

Keep credentials, callback addresses and runtime keys out of templates. The client service header references the protected router key file. Approve app authorization, persistent credentials and plugin/event permissions for their actual scope; a template grants no access.
