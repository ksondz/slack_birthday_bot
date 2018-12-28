
require('dotenv').load();

const Koa = require('koa');
const router = require('koa-router')();
const koaBody = require('koa-body');

const birthdayBot = require('./birthdayBot');

const app = new Koa();
app.use(koaBody());


router.get('/', async ctx => {
  ctx.body = 'It should work';
});

router.post('/birthday/cron', async ctx => {
  await birthdayBot.cronJob();
});

router.post('/birthday/interactivity', async ctx => {
  await birthdayBot.handleInteractivityMessage(ctx.request.body);
});

app.use(router.routes());

const port = process.env.port || 8000;
app.listen(port);

console.log("Server up and listening");

// 1. 30 числа каждого месяца сообщать-кто в след. месяце именинник и сколько денег сдавать (если можно прописать сумму)
// 2. за неделю создать чат для выбора подарка именинникам
// 3. за 1 день напомнить, что Др завтра (только в будние)
// 4. в день ДР напомнить всем в 9.30, что ДР сегодня + поздравляшка (если возможно)
