import { ZZZPlugin } from '../lib/plugin.js';
import render from '../lib/render.js';
import { rulePrefix } from '../lib/common.js';
import { getAuthKey } from '../lib/authkey.js';
import settings from '../lib/settings.js';
import _ from 'lodash';
import common from '../../../lib/common/common.js'
import {
  anaylizeGachaLog,
  updateGachaLog,
  getZZZGachaLink,
} from '../lib/gacha.js';
import { getQueryVariable } from '../utils/network.js';

export class GachaLog extends ZZZPlugin {
  constructor() {
    super({
      name: '[ZZZ-Plugin]GachaLog',
      dsc: 'zzzGachaLog',
      event: 'message',
      priority: _.get(settings.getConfig('priority'), 'gachalog', 70),
      rule: [
        {
          reg: `^${rulePrefix}抽卡帮助$`,
          fnc: 'gachaHelp',
        },
        {
          reg: `${rulePrefix}抽卡链接$`,
          fnc: 'startGachaLog',
        },
        {
          reg: `${rulePrefix}(刷新|更新)抽卡(链接|记录)$`,
          fnc: 'refreshGachaLog',
        },
        {
          reg: `^${rulePrefix}抽卡(分析|记录)$`,
          fnc: 'gachaLogAnalysis',
        },
        {
          reg: `^${rulePrefix}获取抽卡链接$`,
          fnc: 'getGachaLink',
        },
      ],
    });
  }
  async gachaHelp() {
    const reply_msg = [
      'ZZZ-Plugin 抽卡链接绑定方法：',
      '一、（不推荐）抓包获取',
      '1. 私聊 bot 发送【#zzz抽卡链接】，等待 bot 回复【请发送抽卡链接】',
      '2. 抓包获取抽卡链接',
      '3. 将获取到的抽卡链接发送给 bot',
      '二、通过 Cookie 刷新抽卡链接（需 bot 主人安装逍遥插件）',
      '1. 前提绑定 Cookie 或者 扫码登录',
      '2. 发送【#zzz刷新抽卡链接】',
      '当抽卡链接绑定完后，可以通过命令【#zzz抽卡分析】来查看抽卡分析',
    ].join('\n');
    await this.reply(reply_msg);
  }
  async startGachaLog() {
    if (!this.e.isPrivate) {
      await this.reply('请私聊发送抽卡链接', false, { at: true });
      return false;
    }
    this.setContext('gachaLog');
    await this.reply('请发送抽卡链接', false, { at: true });
  }
  async gachaLog() {
    if (!this.e.isPrivate) {
      await this.reply('请私聊发送抽卡链接', false, { at: true });
      return false;
    }
    const msg = this.e.msg.trim();
    const key = getQueryVariable(msg, 'authkey');
    if (!key) {
      await this.reply('抽卡链接格式错误，请重新发送');
      this.finish('gachaLog');
      return false;
    }
    this.finish('gachaLog');
    this.getLog(key);
  }
  async refreshGachaLog() {
    const uid = await this.getUID();
    if (!uid) return false;
    const lastQueryTime = await redis.get(`ZZZ:GACHA:${uid}:LASTTIME`);
    const gachaConfig = settings.getConfig('gacha');
    const coldTime = _.get(gachaConfig, 'interval', 300);
    if (lastQueryTime && Date.now() - lastQueryTime < 1000 * coldTime) {
      await this.reply(`${coldTime}秒内只能刷新一次，请稍后再试`);
      return false;
    }
    await redis.set(`ZZZ:GACHA:${uid}:LASTTIME`, Date.now());
    try {
      const key = await getAuthKey(this.e, this.User, uid);
      if (!key) {
        await this.reply('authKey获取失败，请检查cookie是否过期');
        return false;
      }
      this.getLog(key);
    } catch (error) {
      await this.reply(error.message);
    }
  }
  async getLog(key) {
    const uid = await this.getUID();
    if (!uid) {
      return false;
    }
    this.reply('抽卡记录获取中请稍等...可能需要一段时间，请耐心等待');
    const { data, count } = await updateGachaLog(key, uid);
    let msg = [] 
    msg.push(`抽卡记录更新成功，共${Object.keys(data).length}个卡池`)
    for (const name in data) {
      msg.push(`${name}新增${count[name] || 0}条记录，一共${
        data[name].length
      }条记录`);
    }
    await this.reply(await common.makeForwardMsg(this.e,msg,'抽卡记录更新成功'));
    return false;
  }

  async gachaLogAnalysis() {
    const uid = await this.getUID();
    if (!uid) {
      return false;
    }
    await this.getPlayerInfo();
    await this.reply(
      '正在分析抽卡记录，首次下载图片资源可能耗费一些时间，请稍等'
    );
    const data = await anaylizeGachaLog(uid);
    if (!data) {
      await this.reply('未查询到抽卡记录，请先发送抽卡链接');
      return false;
    }
    const result = {
      data,
    };
    await render(this.e, 'gachalog/index.html', result);
  }
  async getGachaLink() {
    if (!this.e.isPrivate||this.e.isGroup) {
      await this.reply('请私聊获取抽卡链接', false, { at: true });
      return false;
    }
    const uid = await this.getUID();
    if (!uid) {
      return false;
    }
    const key = await getAuthKey(this.e, this.User, uid);
    if (!key) {
      await this.reply('authKey获取失败，请检查cookie是否过期');
      return false;
    }
    const link = await getZZZGachaLink(key);
    await this.reply(link);
  }
}
