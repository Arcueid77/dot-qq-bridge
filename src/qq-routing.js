import {conversationRoute, interactionPolicy} from '@dot-bridge/core/channels/experience-policy.js';

export const qqRoutingChannel = Object.freeze({id: 'qq', experience: Object.freeze({groups: true})});

export function qqRoute(config, message) {
  if (!message) return undefined;
  return conversationRoute({channel: qqRoutingChannel,
    credentials: {ownerId: config.ownerOpenid, conversationId: config.ownerOpenid},
    interaction: config.interaction ?? interactionPolicy({}, qqRoutingChannel)}, {
    senderId: message.owner, conversationId: message.groupOpenid ?? config.ownerOpenid,
    chatType: message.groupOpenid ? 'group' : 'private', botMentioned: message.botMentioned === true,
    text: message.text ?? '',
  });
}

export function sameQqConversation(config, first, second) {
  const left = qqRoute(config, first), right = qqRoute(config, second);
  return Boolean(left && right && left.key === right.key);
}

export function qqDestination(config, message) {
  if (message.groupOpenid && !qqRoute(config, message)) throw new Error('QQ source conversation is unavailable.');
  return message.groupOpenid ? 'groups/' + encodeURIComponent(message.groupOpenid) :
    'users/' + encodeURIComponent(message.owner);
}
