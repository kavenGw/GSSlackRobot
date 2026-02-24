import chalk from 'chalk';

function ts(): string {
  return chalk.gray(`[${new Date().toLocaleTimeString('en-GB', { hour12: false })}]`);
}

export const log = {
  startup() {
    console.log(`${ts()} ${chalk.blue('✦')} GSSlackRobot is running`);
  },

  incoming(user: string, text: string) {
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    console.log(`${ts()} ${chalk.cyan('←')} @${user}: ${preview}`);
  },

  claudeStart(promptLen: number) {
    console.log(`${ts()} ${chalk.yellow('↻')} Claude 调用开始 (${promptLen} chars)`);
  },

  claudeDone(ms: number, chars: number) {
    const sec = (ms / 1000).toFixed(1);
    console.log(`${ts()} ${chalk.green('✓')} Claude 完成 (${sec}s, ${chars} chars)`);
  },

  reply(segments: number) {
    console.log(`${ts()} ${chalk.green('→')} 已发送回复 (${segments} 条消息)`);
  },

  help() {
    console.log(`${ts()} ${chalk.green('→')} 发送帮助信息`);
  },

  error(msg: string) {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    console.error(chalk.red(`[ERROR ${time}] ✘ ${msg}`));
  },
};
