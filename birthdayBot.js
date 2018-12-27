
const fs = require('fs');
const moment = require('moment');
const { WebClient, RTMClient } = require('@slack/client');

module.exports = new class BirthdayBot {

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
   * @param userId
   * @param month
   * @param day
   */
  static editUserBirthday(userId, month = null, day = null) {
    const db = BirthdayBot.getDb();

    if (!db.users[userId]) {
      db.users[userId] = { birthday: { month, day } };
    } else {
      db.users[userId].birthday.month = month || db.users[userId].birthday.month;
      db.users[userId].birthday.day = day || db.users[userId].birthday.day;
    }

    BirthdayBot.refreshDb(db);
  }

  /**
   * @param user
   * @returns {{color: string, callback_id: string, text: string, fallback: string, actions: *[]}}
   */
  static renderUsersListAttachment(user) {
    let actions = BirthdayBot.getUserSelectActions(user);

    let text = `${user.real_name} - `;
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

    return {
      text,
      actions,
      color,
      fallback: 'You can not edit users',
      callback_id: `${user.id}`,
    };
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


  constructor() {
    const { token } = process.env;
    if (!token) {
      throw new Error('Please create .env file in the root application folder. You can copy .env-example.');
    }

    this.rtm = new RTMClient(token);
    this.web = new WebClient(token);
  }

  /**
   * @returns {Promise<void>}
   */
  async start() {
    await this.authenticate();

    await this.rtm.start();
    await this.__subscribe();
  }

  /**
   * @returns {Promise<void>}
   */
  async authenticate(){
    const authTest = await this.web.auth.test();
    const users = await this.__getUsers();
    users.forEach(user => {
      if (user.id === authTest.user_id) {
        this.authUser = user;
      }
    });
  }

  /**
   * @param data
   * @returns {Promise<void>}
   */
  async handleInteractivityMessage(data) {
    const message = await this.__filterInteractivityMessage(data);

    if (message && message.callback_id && message.actions[0] && message.actions[0].selected_options[0]) {
      const action = message.actions[0];
      const userId = message.callback_id;
      const { value } = action.selected_options[0];

      if (await this.isValidSelectedOption(userId, value)) {

        const month = action.name === 'month' ? value : null;
        const day = action.name === 'day' ? value : null;

        if (month || day) {
          BirthdayBot.editUserBirthday(message.callback_id, month, day);

          const birthdayUser = await this.__getBirthdayUser(message.callback_id);
          await this.__usersListResponse(
            { channel: message.channel.id, ts: message.message_ts },
            BirthdayBot.renderUsersListAttachment(birthdayUser),
          );

        } else {
          console.log('wrong action name')
        }
      }
    }
  }

  /**
   * @param userId
   * @param optionValue
   * @returns {Promise<*>}
   */
  async isValidSelectedOption(userId, optionValue) {
    const months = BirthdayBot.getMonths();
    const user = await this.__getBirthdayUser(userId);

    if (!user) {
      return false;
    }

    const { birthday } = user;
    const month = months[optionValue];
    const day = parseInt(optionValue, 10);

    return (month || (user.birthday && (((day ^ 0) === day) && months[birthday.month]['days'] >= day)));
  }


  /**
   * @param data
   * @returns {Promise<*>}
   * @private
   */
  async __filterInteractivityMessage(data) {
    const message = data.payload ? BirthdayBot.jsonParse(data.payload) : false;

    if (message && message.actions && message.channel && message.channel.id && await this.__isPrivateBotChannel(message.channel.id)) {
      return message;
    }

    return false;
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
    switch (true) {
      case(data.text.includes('help')):
        const user = await this.__getUserById(data.user);
        await this.__postMessage({
          channel: data.channel,
          icon_emoji: ':sunglasses:',
          text: `I am glad to see you ${user.real_name}, you can use following commands:`,
          attachments:[
            {
              text: '`list` You can check and edit users birthday list',
              color: 'good',
              mrkdwn_in: ['text']
            }
          ],
        });
        break;
      case(data.text.includes('list')):
        await this.__usersListResponse({ channel: data.channel });
        break;
      default:
        const text = 'Man, I don\'t understand you. I\'m just a bot, you know.. \n Try typing `help` to see what I can do.';
        await this.__postMessage({ channel: data.channel, text, icon_emoji: ':sunglasses:' });
    }
  }

  /**
   * @param options
   * @param userAttachment
   * @returns {Promise<void>}
   * @private
   */
  async __usersListResponse(options, userAttachment) {
    const birthdayUsers = await this.__getBirthdayUsers();

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
   * @returns {Promise<void>}
   * @private
   */
  async __getBirthdayUsers() {
    const db = BirthdayBot.getDb();
    const users = await this.__getUsers();
    const birthdayUsers = {};

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
   * @param userId
   * @returns {Promise<*|null>}
   * @private
   */
  async __getBirthdayUser(userId) {
    const birthdayUsers = await this.__getBirthdayUsers();

    return birthdayUsers[userId] || null;
  }

  /**
   * @param params
   * @returns {Promise<WebAPICallResult>}
   */
  async __postMessage(params = {}) {
    return await this.web.chat.postMessage(params);
  }

  /**
   * @param data
   * @returns {boolean}
   * @private
   */
  __isBotMessage(data) {
    return (data.bot_id === this.authUser.profile.bot_id);
  }

  /**
   *
   * @param channelId
   * @returns {Promise<WebAPICallResult | boolean>}
   */
  async __isPrivateBotChannel(channelId) {
    const users = await this.__getConversationUsers(channelId);
    return (users.length === 2) && users.includes(this.authUser.id);
  }

  /**
   * @returns {Promise<any>}
   * @private
   */
  async __getUsers() {
    const usersList = await this.web.users.list();
    return (usersList && usersList.members) ? usersList.members : [];
  }

  /**
   * @param userId
   * @returns {Promise<boolean>}
   * @private
   */
  async __getUserById(userId) {
    const users = await this.__getUsers();
    return users.find(user => {
      if (user.id === userId) {
        return user;
      }
    });
  }

  /**
   * @returns {Promise<any>}
   * @private
   */
  async __getConversationUsers(channelId) {
    const result = await this.web.conversations.members({ channel: channelId });
    return result && result.members ? result.members : [];
  }

  /**
   * @param options
   * @returns {Promise<void>}
   * @private
   */
  async __updateChatMessage(options) {
    await this.web.chat.update(options);
  }
}();
