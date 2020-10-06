const settings = require('./settings.js');
const chatbot = require('./chatbot.js');
const quesoqueue = require('./queue.js').quesoqueue();
const twitch = require('./twitch.js').twitch();
const timer = require('./timer.js');
const i18n = require("i18n");
const global_lang = { channel: settings.channel, command_add: '!add', command_back: '!back', command_remove: '!remove' };

i18n.configure({
  locales: settings.locales,
  directory: __dirname + '/locales',
  objectNotation: true,
  register: global,
});
i18n.setLocale(settings.locale);

quesoqueue.load();

var queue_open = false;
var selection_iter = 0;
const level_timer = timer.timer(
  () => {
    chatbot_helper.say(__('timer.expired', global_lang));
  },
  settings.level_timeout * 1000 * 60
);

const get_remainder = x => {
  var index = x.indexOf(' ');
  if (index == -1) {
    return '';
  }
  return x.substr(index + 1);
};

const Level = (level_code, submitter) => {
  return { code: level_code, submitter: submitter };
};

var can_list = true;
const level_list_message = (current, levels) => {
  if (
    current === undefined &&
    levels.online.length === 0 &&
    levels.offline.length === 0
  ) {
    return __('queue.list.empty', {sender, ...global_lang});
  }

  let levels5 = levels.online.slice(0, 5).reduce((acc, x) => acc + __('listSeparator') + x.submitter, '');
  let etc = levels.online.length > 5;
  let online = levels.online.length + (current !== undefined ? 1 : 0);
  let offline = levels.offline.length;
  return __mf('queue.list.message_mf', {...current, levels: levels5, etc, online, offline, sender, ...global_lang});
};

const next_level_message = (level, sender = undefined, type = undefined) => {
  if (level === undefined) {
    return __mf('queue.next.empty_mf', {type, sender, ...global_lang});
  }
  return __mf('queue.next.level_mf', {...level, type, sender, ...global_lang});
};

const current_level_message = (level, sender = undefined) => {
  if (level === undefined) {
    return __('queue.current.empty', {sender, ...global_lang});
  }
  return __('queue.current.level', {...level, sender, ...global_lang});
};

const position_message = async (position, sender) => {
  if (position == -1) {
    return __('queue.position.unavailable', {sender, ...global_lang});
  } else if (position === 0) {
    return __('queue.position.current', {sender, ...global_lang});
  }
  return __mf('queue.position.position_mf', {position, sender, ...global_lang});
};

const command = (message, commands) => {
  return commands.some(command => command == message);
};

const arg_command = (message, commands) => {
  var index = message.indexOf(' ');
  var check = message;
  if (index != -1) {
    check = message.substr(0, index);
  }
  return commands.some(command => command == check);
};

// What the bot should do when someone sends a message in chat.
// `message` is the full text of the message. `sender` is the username
// of the person that sent the message.
async function HandleMessage(message, sender, respond) {
  if (sender.username === undefined || message === undefined) {
    console.log('undefined data');
  }
  twitch.noticeChatter(sender);
  if (command(message, settings.commands.open) && sender.isBroadcaster) {
    queue_open = true;
    respond(__('queue.open', {sender: sender.displayName, ...global_lang}));
  } else if (command(message, settings.commands.close) && sender.isBroadcaster) {
    queue_open = false;
    respond(__('queue.close', {sender: sender.displayName, ...global_lang}));
  } else if (arg_command(message, settings.commands.add)) {
    if (queue_open || sender.isBroadcaster) {
      let level_code = get_remainder(message);
      let level = Level(level_code, sender.displayName);
      let result = quesoqueue.add(level);
      respond(__(`queue.add.${result}`, {...level, sender: sender.displayName, ...global_lang}));
    } else {
      respond(__('queue.add.closed', {sender: sender.displayName, ...global_lang}));
    }
  } else if (arg_command(message, settings.commands.remove)) {
    var result = undefined;
    var command = undefined;
    if (sender.isBroadcaster) {
      var to_remove = get_remainder(message);
      result = quesoqueue.modRemove(to_remove);
      command = "modRemove";
    } else {
      result = quesoqueue.remove(sender.displayName);
      command = "remove";
    }
    if (result === undefined) {
      respond(__(`queue.${command}.unavailable`, {sender: sender.displayName, ...global_lang}));
    } else {
      respond(__(`queue.${command}.current`, {...result, sender: sender.displayName, ...global_lang}));
    }
  } else if (arg_command(message, settings.commands.replace)) {
    let level_code = get_remainder(message);
    let level = Level(level_code, sender.displayName);
    let result = quesoqueue.replace(level.submitter, level.code);
    respond(__(`queue.replace.${result}`, {...level, sender: sender.displayName, ...global_lang}));
  } else if (command(message, settings.commands.level) && sender.isBroadcaster) {
    let next_level = undefined;
    let selection_mode = settings.level_selection[selection_iter++];
    if (selection_iter >= settings.level_selection.length) {
      selection_iter = 0;
    }
    switch (selection_mode) {
      case 'next':
        next_level = await quesoqueue.next();
        break;
      case 'subnext':
        next_level = await quesoqueue.subnext();
        break;
      case 'modnext':
        next_level = await quesoqueue.modnext();
        break;
      case 'random':
        next_level = await quesoqueue.random();
        break;
      case 'subrandom':
        next_level = await quesoqueue.subrandom();
        break;
      case 'modrandom':
        next_level = await quesoqueue.modrandom();
        break;
      default:
        selection_mode = 'default';
        next_level = await quesoqueue.next();
    }
    level_timer.restart();
    level_timer.pause();
    respond(next_level_message(next_level, sender.displayName, selection_mode));
  } else if (command(message, settings.commands.next) && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.next();
    respond(next_level_message(next_level, sender.displayName));
  } else if (command(message, settings.commands.subnext) && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.subnext();
    respond(next_level_message(next_level, sender.displayName));
  } else if (command(message, settings.commands.modnext) && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.modnext();
    respond(next_level_message(next_level, sender.displayName));
  } else if (command(message, settings.commands.random) && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.random();
    respond(next_level_message(next_level, sender.displayName));
  } else if (command(message, settings.commands.subrandom) && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.subrandom();
    respond(next_level_message(next_level, sender.displayName));
  } else if (command(message, settings.commands.modrandom) && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let next_level = await quesoqueue.modrandom();
    respond(next_level_message(next_level, sender.displayName));
  } else if (command(message, settings.commands.punt) && sender.isBroadcaster) {
    level_timer.restart();
    level_timer.pause();
    let punt_level = await quesoqueue.punt();
    if (punt_level !== undefined) {
      respond(__('queue.punt.current', {...punt_level, sender: sender.displayName, ...global_lang}));
    } else {
      respond(__('queue.punt.unavailable', {sender: sender.displayName, ...global_lang}));
    }
  } else if (arg_command(message, settings.commands.dip) && sender.isBroadcaster) {
    var username = get_remainder(message);
    level_timer.restart();
    level_timer.pause();
    var dip_level = quesoqueue.dip(username);
    if (dip_level !== undefined) {
      respond(__('queue.dip.current', {...dip_level, sender: sender.displayName, ...global_lang}));
    } else {
      respond(__('queue.dip.unavailable', {username, sender: sender.displayName, ...global_lang}));
    }
  } else if (command(message, settings.commands.current)) {
    respond(current_level_message(quesoqueue.current(), sender.displayName));
  } else if (arg_command(message, settings.commands.list)) {
    if (can_list) {
      can_list = false;
      setTimeout(() => can_list = true, settings.message_cooldown * 1000);
      respond(level_list_message(quesoqueue.current(), await quesoqueue.list()));
    } else {
      respond(__('queue.list.messageCooldown', {sender: sender.displayName, ...global_lang}));
    }
  } else if (command(message, settings.commands.position)) {
    respond(await position_message(await quesoqueue.position(sender.displayName), sender.displayName));
  } else if (command(message, settings.commands.start) && sender.isBroadcaster) {
    level_timer.resume();
    respond(__('timer.start', {sender: sender.displayName, ...global_lang}));
  } else if (command(message, settings.commands.resume) && sender.isBroadcaster) {
    level_timer.resume();
    respond(__('timer.resume', {sender: sender.displayName, ...global_lang}));
  } else if (command(message, settings.commands.pause) && sender.isBroadcaster) {
    level_timer.pause();
    respond(__('timer.pause', {sender: sender.displayName, ...global_lang}));
  } else if (command(message, settings.commands.restart) && sender.isBroadcaster) {
    level_timer.restart();
    respond(__('timer.restart', {sender: sender.displayName, ...global_lang}));
  } else if (command(message, settings.commands.restore) && sender.isBroadcaster) {
    quesoqueue.load();
    respond(level_list_message(quesoqueue.current(), await quesoqueue.list()));
  } else if (command(message, settings.commands.clear) && sender.isBroadcaster) {
    quesoqueue.clear();
    respond(__('queue.clear', {sender: sender.displayName, ...global_lang}));
  } else if (command(message, settings.commands.lurk)) {
    twitch.setToLurk(sender.username);
    respond(__('queue.lurk', {sender: sender.displayName, ...global_lang}));
  } else if (command(message, settings.commands.back)) {
    if (twitch.notLurkingAnymore(sender.username)) {
      respond(__('queue.back', {sender: sender.displayName, ...global_lang}));
    }
  } else if (command(message, settings.commands.order)) {
    if (settings.level_selection.length == 0) {
      respond(__('queue.order.unavailable', {sender: sender.displayName, ...global_lang}));
    } else {
      let order = settings.level_selection.map(type => __mf('queue.order.type_mf', {type})).reduce((acc, x) => acc + __('listSeparator') + x);
      let next = __mf('queue.order.type_mf', {type: settings.level_selection[selection_iter % settings.level_selection.length]});
      respond(__('queue.order.current', {order, next, sender: sender.displayName, ...global_lang}));
    }
  }
}

// Set up the chatbot helper and connect to the Twitch channel.
const chatbot_helper = chatbot.helper(
  settings.username,
  settings.password,
  settings.channel
);
chatbot_helper.setup(HandleMessage);
chatbot_helper.connect();