
const fs = require('fs');
const { WebClient, RTMClient } = require('@slack/client');

module.exports = new class BirthdayBot {

  /**
   * @returns {string}
   * @constructor
   */
  static get DB_FILE_PATH() {
    return './birthdays-db.json';
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
    * @private
    */
  async __subscribe() {

    this.rtm.on('message', async data => {
      if ((data.type === 'message') && !this.__isBotMessage(data)) {

        if (await this.__isPrivateBotChannel(data.channel)) {
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
        await this.__helpResponse(data);
        break;
      case(data.text.includes('users:list')):
        await this.__usersBirthdayDatesResponse(data);
        break;
      case(data.text.includes('users:edit')):
        await this.__editUserBirthdayDate(data);
        await this.__usersBirthdayDatesResponse(data);
        break;
      default:
        const text = 'Man, I don\'t understand you. I\'m just a bot, you know.. \n Try typing `help` to see what I can do.';
        await this.__postMessage({ channel: data.channel, text, icon_emoji: ':sunglasses:' });
    }
  }

  /**
   * @param data
   * @returns {Promise<void>}
   * @private
   */
  async __editUserBirthdayDate(data) {
    const textParts = data.text.split(':');

    if ((textParts.length > 3) && (textParts[0] === 'users') && (textParts[1] === 'edit')) {
      const dateParts = textParts[3].split('.');
      if (dateParts.length === 3) {
        const date = new Date(dateParts[2], dateParts[1], dateParts[0]);

        if (date.getFullYear() && date.getMonth() && date.getDay()) {
          const db = await this.__getDb();

          if (!db.users[textParts[2]]) {
            db.users[textParts[2]] = {};
          }

          db.users[textParts[2]].birthdayDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
          await this.__refreshDb(db);
        }
      }
    }
  }

  /**
   * @param data
   * @returns {Promise<void>}
   * @private
   */
  async __usersBirthdayDatesResponse(data) {
    const birthdayUsers = await this.__getBirthdayUsers();
    const attachments = [];

    Object.keys(birthdayUsers).forEach(userId => {
      const user = birthdayUsers[userId];

      attachments.push({
        color: user.birthdayDate ? 'good' : "danger",
        text: `${user.real_name} (${user.id}) - ${user.birthdayDate || 'is not defined'}`
      });
    });

    await this.__postMessage({ channel: data.channel, text: "Users birthday dates", attachments });
  }

  /**
   * @param data
   * @returns {Promise<void>}
   * @private
   */
  async __helpResponse(data) {

    await this.__postMessage({
      channel: data.channel,
      text: "Would you like to play a game?",
      attachments: [
        {
          "text": "Choose a game to play",
          "fallback": "You are unable to choose a game",
          "callback_id": "wopr_game",
          "color": "#3AA3E3",
          "attachment_type": "default",
          "actions": [
            {
              "name": "game",
              "text": "Chess",
              "type": "button",
              "value": "chess"
            },
            {
              "name": "game",
              "text": "Falken's Maze",
              "type": "button",
              "value": "maze"
            },
            {
              "name": "game",
              "text": "Thermonuclear War",
              "style": "danger",
              "type": "button",
              "value": "war",
              "confirm": {
                "title": "Are you sure?",
                "text": "Wouldn't you prefer a good game of chess?",
                "ok_text": "Yes",
                "dismiss_text": "No"
              }
            }
          ]
        }
      ]
    });
  }

  /**
   * @returns {Promise<void>}
   * @private
   */
  async __getBirthdayUsers() {
    const db = this.__getDb();
    const users = await this.__getUsers();
    const birthdayUsers = {};

    users.forEach(user => {
      if (!user.is_bot && user.profile && user.profile.email) {
        birthdayUsers[user.id] = { ...user };

        if (db.users[user.id]) {
          birthdayUsers[user.id].birthdayDate = db.users[user.id].birthdayDate;
        }
      }
    });

    return birthdayUsers;
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
   * @returns {Promise<any>}
   * @private
   */
  async __getConversationUsers(channelId) {
    const result = await this.web.conversations.members({ channel: channelId });
    return result && result.members ? result.members : [];
  }

  /**
   * @returns {{}}
   */
  __getDb() {
    if (fs.existsSync(BirthdayBot.DB_FILE_PATH)) {
      const db = fs.readFileSync(BirthdayBot.DB_FILE_PATH);
      return JSON.parse(db);
    }

    return {
      manager: false,
      users: {},
    };
  }

  /**
   * @param data
   */
  __refreshDb(data) {
    fs.writeFileSync(BirthdayBot.DB_FILE_PATH, JSON.stringify(data));
  }
}();
