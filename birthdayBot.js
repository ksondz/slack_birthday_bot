
const axios = require('axios');
const { WebClient, RTMClient } = require('@slack/client');

module.exports = new class BirthdayBot {


  constructor() {
    const { token } = process.env;
    if (!token) {
      throw new Error('Please create .env file in the root application folder. You can copy .env_example.');
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
  async __usersBirthdayDatesResponse(data) {

    const users = await this.__getUsersBirthdayDates();
    const attachments = [];

    await this.__postMessage({
      channel: data.channel,
      text: "Users birthday dates",
      attachments: [
        {
          "text": "User 1234 - 12.12.2018"
        },
        {
          "text": "User 1234 - 12.12.2018"
        }
      ]
    });
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
   * @param params
   * @returns {Promise<WebAPICallResult>}
   */
  async __postMessage(params = {}) {
    return await this.web.chat.postMessage(params);
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
}();
