
# Set up slack bot server
 
 ## Create a slack bot
 1) Open https://api.slack.com/apps
 2) You can see your apps list and a button to Create New App
 3) Click to the button then set new app name and set a workspace where you want to use it
 
 ## Configure .env file
 1) Create .env file from .env-example in the root folder.
 2) Open slack bot (slack app) then choose `OAuth & Permissions`
 3) Inside `OAuth Tokens & Redirect URLs` you can see `Bot User OAuth Access Token`
 3) Copy `Bot User OAuth Access Token` and edit example token `slack_bot_access_token` inside .env file
 
 ## Interactive components
 1) Open slack bot (slack app) then choose `Interactive Components` 
 2) Enable it and set Request URL. 
 3) Use this route - `/birthday/interactivity`
 
 ## Create a cron job
 1) The job should be run every day at 9 hours 30 minutes. 
 2) Use this route - `/birthday/cron`
 
 ## Start
 1) `nvm use`
 2) `npm i`
 3) `node index.js` or if pm2 is installed you can run `run_pm2_server_process.sh` 
 