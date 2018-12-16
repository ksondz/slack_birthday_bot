
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
    await this.__welcomeMessage();
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
    *
    * @private
    */
  async __welcomeMessage() {
    const channels = await this.__getChannels();

    channels.forEach(async channel => {
      if (channel.name === 'general') {
        await this.web.chat.postMessage({
          channel: channel.id,
          text: `Get Ready To Work With <@${this.authUser.id}>!`,
          icon_emoji: ':smiley:',
        });
      }
    });
  }

  /**
    * @private
    */
  async __subscribe() {

    this.rtm.on('message', async data => {
      if (data.type !== 'message') { return; }

      if (data.bot_id === this.authUser.profile.bot_id) { return; }

      if (await this.__isPrivateBirthdayBotChannel(data.channel)) {
        switch (true) {
          case(data.text.includes('chucknorris')):
            const jokeResponse = await axios.get('http://api.icndb.com/jokes/random');
            await this.__postMessage({ channel: data.channel, text: `Chuck Norris: ${jokeResponse.data.value.joke}`, icon_emoji: ':laughing:' });

            break;
          case(data.text.includes('yomama')):
            const yomommaResponse = await axios.get('http://api.yomomma.info');
            await this.__postMessage({ channel: data.channel, text: `Yo Mama: ${yomommaResponse.data.joke}`, icon_emoji: ':laughing:' });

            break;
          case(data.text.includes('help')):
            await this.__postMessage({ channel: data.channel, text: `Type @jokebot with either 'chucknorris' or 'yomama' to get a joke`, icon_emoji: ':question:' });
            break;
          case(data.text.includes('Hi')):
          case(data.text.includes('hi')):
          case(data.text.includes('hey')):
          case(data.text.includes('Hey')):
          case(data.text.includes('Hello')):
          case(data.text.includes('hello')):
            const users = await this.__getUsers();

            users.forEach(async user => {
              if (data.user === user.id) {
                await this.__postMessage({ channel: data.channel, text: `Hello, <@${user.id}> !` });
              }
            });
            break;
          default:
            const text = 'Man, I don\'t understand you. I\'m just a bot, you know.. \n Try typing `help` to see what I can do.';
            await this.__postMessage({ channel: data.channel, text, icon_emoji: ':sunglasses:' });
        }
      }
    });
  }

  /**
   *
   * @param channelId
   * @returns {Promise<WebAPICallResult | boolean>}
   */
  async __isPrivateBirthdayBotChannel(channelId) {
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
  async __getChannels() {
    const channelsList = await this.web.channels.list();
    return (channelsList && channelsList.channels) ? channelsList.channels : [];
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
