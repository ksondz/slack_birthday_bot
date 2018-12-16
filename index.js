
require('dotenv').load();

const Koa = require('koa');
const router = require('koa-router')();
const koaBody = require('koa-body');

const birthdayBot = require('./birthdayBot');

birthdayBot.start();

const app = new Koa();
app.use(koaBody());


router.get('/', async ctx => {
  ctx.body = 'My koa API';
});

router.post('/botEvents', async ctx => {
  const { body } = ctx.request;

  ctx.contentType = 'application/json';
  ctx.status = 200;
  ctx.body = { challenge: body.challenge };
});

app.use(router.routes());

app.listen(8000);

console.log("Server up and listening");
