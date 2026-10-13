import test from 'node:test';import assert from 'node:assert/strict';
import {makeOwnerMessageExperimentTransport} from '@dot-bridge/core/transport/experimental/owner-message.js';
import {projectToolResult,projectLarkPreflight} from '../src/live-contract.js';
const fixture=()=>({send:makeOwnerMessageExperimentTransport({approvedOwnerMessageExperiment:true,channel:'qq',expectedText:'owner connection test',deadlineMs:Date.now()+60000,proxyEnv:{HTTPS_PROXY:'http://proxy.example.test:3128'}})});
test('aggregate QQ/Lark projections retain explicit experiment mode without fabricating delivery proof',()=>{
 const f=fixture(),transport=f.send.preflight();
 const qq=projectToolResult({name:'check_bridge_setup',arguments:{}},{isError:false,structuredContent:{configuration_ready:true,events_discoverable:true,missing_settings:[],callback_hostname:null,callback_policy:'not_provided',qq_api_profile:'documented',network_checked:false,next_step:'ignored',callback_transport:transport}},true);assert.equal(qq.callback_transport.mode,'owner_single_message_proxy');assert.equal(qq.callback_transport.destination_binding,'unverified');
 const lark=projectLarkPreflight({arguments:{}},{isError:false,structuredContent:{callback_hostname:null,callback_policy:'not_provided',binding_ready:true,delivery_configured:true,network_checked:false,callback_transport:transport}});assert.equal(lark.callback_transport.mode,'owner_single_message_proxy');assert.equal(lark.end_to_end_verified,false);assert.equal(lark.ready_for_delivery,false);
});
