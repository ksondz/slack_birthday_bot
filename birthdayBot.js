
const fs = require('fs');
const moment = require('moment');
const _ = require('lodash');
const { WebClient, RTMClient } = require('@slack/client');
const { token, channel } = process.env;

module.exports = new class BirthdayBot {

  /**
   * @returns {string}
   * @constructor
   */
  static get DB_FILE_PATH() {
    return './birthdays-db.json';
  }

  /**
   * @returns {string}
   * @constructor
   */
  static get MONTHS_FILE_PATH() {
    return './months.json';
  }

  /**
   * @param descriptionString
   * @returns {*}
   */
  static jsonParse(descriptionString) {
    try {
      return JSON.parse(descriptionString);
    } catch (e) {
      return false;
    }
  }

  /**
   * @returns {*}
   */
  static getDb() {
    if (fs.existsSync(BirthdayBot.DB_FILE_PATH)) {
      const db = fs.readFileSync(BirthdayBot.DB_FILE_PATH);
      return JSON.parse(db);
    }

    return { manager: false, users: {} };
  }

  /**
   * @param data
   */
  static refreshDb(data) {
    fs.writeFileSync(BirthdayBot.DB_FILE_PATH, JSON.stringify(data));
  }

  /**
   * @returns object
   */
  static getMonths() {
    if (fs.existsSync(BirthdayBot.MONTHS_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(BirthdayBot.MONTHS_FILE_PATH));
      return data || {};
    }

    return {};
  }

  /**
   * @param user
   * @param month
   * @param day
   */
  static editUserBirthday(user, month = null, day = null) {
    const db = BirthdayBot.getDb();
    const dbUser = db.users[user.id] = db.users[user.id] || {};

    const birthday = { month, day };

    if (dbUser.birthday) {
      birthday.month = month || dbUser.birthday.month;
      birthday.day = day || dbUser.birthday.day;
    }

    dbUser.birthday = birthday;
    user.birthday = birthday;

    BirthdayBot.refreshDb(db);
  }

  /**
   * @param user
   * @returns {{color: string, callback_id: string, text: string, fallback: string, actions: *[]}}
   */
  static renderUsersListAttachment(user) {
    let actions = BirthdayBot.getUserSelectActions(user);

    let text = `${user.real_name || user.name} - `;
    let color = 'danger';

    switch (true) {
      case (user.birthday && !!user.birthday.month && !!user.birthday.day):
        text += `${user.birthday.month} ${user.birthday.day || ''}`;
        color = 'good';
        break;
      case (user.birthday && !user.birthday.day):
        text += 'birthday day is not defined';
        break;
      default:
        text += 'birthday is not defined';
    }

    return { text, actions, color, fallback: 'You can not edit users', callback_id: `${user.id}`};
  }

  /**
   * @param user
   * @returns {*[]}
   */
  static getUserSelectActions(user) {
    const months = BirthdayBot.getMonths();

    const monthSelect = { name: 'month', user: { id: user.id }, type: 'select', options: [], selected_options: [] };
    const daySelect = { name: 'day', user: { id: user.id }, type: 'select', options: [], selected_options: [] };

    Object.keys(months).forEach(monthName => {
      BirthdayBot.addMonthAndDaySelectOptions(monthSelect, daySelect, months[monthName], user);
    });

    return [monthSelect, daySelect];
  }

  /**
   * @param monthSelect
   * @param daySelect
   * @param monthData
   * @param user
   */
  static addMonthAndDaySelectOptions(monthSelect, daySelect, monthData, user) {
    const monthOption = { text: monthData.name, value: monthData.name };
    monthSelect.options.push(monthOption);

    if (user.birthday && (user.birthday.month === monthData.name)) {
      monthSelect.selected_options.push(monthOption);
      BirthdayBot.addDaySelectOptions(daySelect, monthData.days, user.birthday.day);
    }
  }

  /**
   * @param daySelect
   * @param daysAmount
   * @param selectedDay
   */
  static addDaySelectOptions(daySelect, daysAmount, selectedDay) {
    const day = parseInt(selectedDay, 10);
    for (let i = 1; i <= daysAmount; i++ ) {
      const dayOption = { text: i, value: `${i}` };

      if (day === i) {
        daySelect.selected_options.push(dayOption);
      }
      daySelect.options.push(dayOption);
    }
  }


  /**
   * @param token
   * @param channelName
   */
  constructor(token, channelName) {
    if (!token) {
      throw new Error('Please create .env file in the root application folder. You can copy .env-example.');
    }

    this.rtm = new RTMClient(token);
    this.web = new WebClient(token);

    (async () => {
      const channel = await this.__getChannelByName(channelName);
      this.channelId = channel.id || '';

      const authTest = await this.web.auth.test();
      await this.__setBotUser(authTest.user_id);

      await this.rtm.start();
      await this.__subscribe();
    })();
  }

  /**
   * @private
   */
  async __subscribe() {

    this.rtm.on('message', async data => {
      if ((data.type === 'message') && !this.__isBotMessage(data)) {

        if (await this.__isPrivateBotChannel(data.channel) && data.text) {
          await this.__handleMessage(data);
        }
      }
    });
  }

  /**
   * @param data
   * @returns {Promise<void>}
   * @private
   */
  async __handleMessage(data) {
    const options = { channel: data.channel, icon_emoji: ':sunglasses:' };
    const managerId = BirthdayBot.getDb()['manager'];
    const userInfo = await this.__getUserInfo(data.user);
    const { user } = userInfo;

    if (userInfo.ok && !userInfo.deleted && (user.is_admin || (user.id === managerId))) {

      switch (true) {
        case(data.text.includes('help')):
          await this.__helpResponse(options, user);
          break;
        case(data.text.includes('list')):
          await this.__usersListResponse(options);
          break;
        case(data.text.includes('manager')):
          await this.__managerResponse(options, data.text);
          break;
        default:
          options.text = 'Man, I don\'t understand you. I\'m just a bot, you know.. \n Try typing `help` to see what I can do.';
          await this.__postMessage(options);
      }
    }
  }

  /**
   * @param data
   * @returns {Promise<void>}
   */
  async handleInteractivityMessage(data) {
    const message = await this.__filterInteractivityMessage(data);

    if (message && message.callback_id && message.actions[0] && message.actions[0].type === 'select') {
      const birthdayUsers = await this.__getBirthdayUsers();
      const user = birthdayUsers[message.callback_id];

      if (user) {
        const months = BirthdayBot.getMonths();
        const { birthday } = user;

        const month = months[message.actions[0].selected_options[0].value];
        const day = parseInt(message.actions[0].selected_options[0].value, 10);

        if (!!month || (!!birthday && (((day ^ 0) === day) && months[birthday.month]['days'] >= day))) {
          const { message_ts, channel, actions } = message;
          await this.interactivitySelectMessage(message_ts, channel, actions, user);
        }
      }
    }
  }

  /**
   * @param message_ts
   * @param channel
   * @param actions
   * @param user
   * @returns {Promise<void>}
   */
  async interactivitySelectMessage(message_ts, channel, actions, user) {
    const actionName = actions[0].name;

    const month = actionName === 'month' ? actions[0].selected_options[0].value : null;
    const day = actionName === 'day' ? actions[0].selected_options[0].value : null;

    if (month || day) {
      BirthdayBot.editUserBirthday(user, month, day);

      const attachment = BirthdayBot.renderUsersListAttachment(user);
      await this.__usersListResponse({ channel: channel.id, ts: message_ts }, attachment);
    } else {
      console.log('wrong action name')
    }
  }

  /**
   * @param data
   * @returns {Promise<*>}
   * @private
   */
  async __filterInteractivityMessage(data) {
    const message = data.payload ? BirthdayBot.jsonParse(data.payload) : false;

    if (
      (message && (message.type === 'interactive_message') && message.actions) &&
      (message.channel && message.channel.id && await this.__isPrivateBotChannel(message.channel.id))
    ) {
      return message;
    }

    return false;
  }

  /**
   * @param options
   * @param userAttachment
   * @returns {Promise<void>}
   * @private
   */
  async __usersListResponse(options, userAttachment) {
    let birthdayUsers = await this.__getBirthdayUsers();
    birthdayUsers = _.orderBy(birthdayUsers, ['real_name'],['asc']);

    options.text = 'Birthday list';
    options.attachments = [];

    Object.keys(birthdayUsers).forEach(userId => {
      if (userAttachment && (userAttachment.callback_id === userId)) {
        options.attachments.push(userAttachment);
      } else {
        options.attachments.push(BirthdayBot.renderUsersListAttachment(birthdayUsers[userId]));
      }
    });

    if (options.ts) {
      await this.__updateChatMessage(options);
    } else {
      await this.__postMessage(options);
    }
  }

  /**
   *
   * @param options
   * @param user
   * @returns {Promise<void>}
   * @private
   */
  async __helpResponse(options, user) {
    options.text = `I am glad to see you ${user.real_name || user.name}, you can use following commands:`;
    options.attachments = [
      {
        text: '`list` - You can check and edit users birthday list',
        color: 'good',
        mrkdwn_in: ['text']
      },
      {
        text: '`manager @AnySlackUser` - You can set a birthday bot manager . \n Just type `manager` then `@` and user name',
        color: 'good',
        mrkdwn_in: ['text']
      },
    ];
    await this.__postMessage(options);
  }

  /**
   * @param options
   * @param text
   * @returns {Promise<void>}
   * @private
   */
  async __managerResponse(options, text) {
    const welcomeOptions = { ...options };
    options.text = 'Wrong command. Type `help` to see commands list';
    const matched = text.match(/<@(.*)>/);

    if (matched && (matched.length === 2)) {
      const info = await this.__getUserInfo(matched[1]);
      if (info.ok && !info.user.is_bot) {
        const db = BirthdayBot.getDb();

        db.manager = info.user.id;
        BirthdayBot.refreshDb(db);

        // const channel = await this.web.channels.create({ name: 'welcome manager' });
        // if (channel.ok) {
        //   const welcomeOption = {
        //     channel: channel.id,
        //     icon_emoji: options.icon_emoji,
        //     text: `Hello ${info.user.real_name || info.user.name}! You are a new Manager of DA-14 Birthday Bot`
        //   };
        //   await this.__postMessage(welcomeOption);
        // }

        options.text = `${info.user.real_name || info.user.name} was defined as a Manager of DA-14 Birthday Bot`;
      }
    }
    await this.__postMessage(options);
  }



  async cronJob() {



  }


  /**
   * @returns {Promise<void>}
   * @private
   */
  async __getBirthdayUsers() {
    const birthdayUsers = {};

    const db = BirthdayBot.getDb();
    const users = await this.__getUsers();

    users.forEach(user => {
      if (!user.is_bot && user.profile && user.profile.email) {
        birthdayUsers[user.id] = { ...user };

        if (db.users[user.id]) {
          birthdayUsers[user.id]['birthday'] = db.users[user.id].birthday;
        }
      }
    });

    return birthdayUsers;
  }

  /**
   * @param options
   * @returns {Promise<void>}
   * @private
   */
  async __updateChatMessage(options) {
    await this.web.chat.update(options);
  }

  /**
   * @param options
   * @returns {Promise<WebAPICallResult>}
   */
  async __postMessage(options = {}) {
    return await this.web.chat.postMessage(options);
  }

  /**
   * @param data
   * @returns {boolean}
   * @private
   */
  __isBotMessage(data) {
    return (data.bot_id === this.botUser.profile.bot_id);
  }

  /**
   *
   * @param channelId
   * @returns {Promise<WebAPICallResult | boolean>}
   */
  async __isPrivateBotChannel(channelId) {
    const userIds = await this.__getConversationUsers(channelId);
    return (userIds.length === 2) && userIds.includes(this.botUser.id);
  }

  /**
   * @param userId
   * @returns {Promise<void>}
   * @private
   */
  async __setBotUser(userId) {
    const user = await this.__getUserById(userId);
    if (user && (user.id === userId)) this.botUser = user;
  }

  /**
   * @returns {Promise<Array>}
   * @private
   */
  async __getUsers() {
    const users = [];

    const allUsers = await this.__getAllUsers();
    const conversationUsers = await this.__getConversationUsers(this.channelId);

    allUsers.forEach(user => {
      conversationUsers.forEach(userId => {
        if (user.id === userId) {
          users.push(user);
        }
      });
    });

    return users;
  }


  /**
   * @returns {Promise<any>}
   * @private
   */
  async __getAllUsers() {
    const usersList = await this.web.users.list();
    return (usersList && usersList.members) ? usersList.members.filter(member => member && !member.deleted) : [];
  }

  /**
   * @param userId
   * @returns {Promise<boolean>}
   * @private
   */
  async __getUserById(userId) {
    const users = await this.__getAllUsers();
    return users.find(user => {
      if (user.id === userId) {
        return user;
      }
    });
  }

  /**
   * @param user
   * @returns {Promise<WebAPICallResult>}
   * @private
   */
  async __getUserInfo(user) {
    return await this.web.users.info({user});
  }

  /**
   * @returns {Promise<any>}
   * @private
   */
  async __getConversationUsers(channelId) {
    const result = await this.web.conversations.members({ channel: channelId });
    return result && result.members ? result.members.filter(member => member && !member.deleted) : [];
  }


  /**
   * @param channelName
   * @returns {Promise<*>}
   * @private
   */
  async __getChannelByName(channelName) {
    const result = await this.web.conversations.list();

    return result.channels.find(channel => {
      if (channel.name === channelName) {
        return channel;
      }
    });
  }
}(token, channel);
