/* @flow */

const range = 2

export function generateCodeFrame (
  source: string,
  start: number = 0,
  end: number = source.length
): string {
  // TODO mac下的换行符是\r，并没有\n，这里能匹配的上？
  // A 旧版本的mac换行符是\r，新版本则是\n
  // https://stackoverflow.com/questions/15433188/r-n-r-and-n-what-is-the-difference-between-them?r=SearchResults
  // https://stackoverflow.com/questions/6539801/reminder-r-n-or-n-r?r=SearchResults
  // https://ccrma.stanford.edu/~craig/utility/flip/
  // https://stackoverflow.com/questions/1761051/difference-between-n-and-r?r=SearchResults
  // http://www.ruanyifeng.com/blog/2006/04/post_213.html
  // https://blog.csdn.net/fanwenbo/article/details/54848429
  const lines = source.split(/\r?\n/)
  let count = 0
  const res = []
  // 循环每行模板
  for (let i = 0; i < lines.length; i++) {
    // 下一行开始处字母的序号
    count += lines[i].length + 1
    if (count >= start) {
      for (let j = i - range; j <= i + range || end > count; j++) {
        if (j < 0 || j >= lines.length) continue
        res.push(`${j + 1}${repeat(` `, 3 - String(j + 1).length)}|  ${lines[j]}`)
        const lineLength = lines[j].length
        if (j === i) {
          // push underline
          const pad = start - (count - lineLength) + 1
          const length = end > count ? lineLength - pad : end - start
          res.push(`   |  ` + repeat(` `, pad) + repeat(`^`, length))
        } else if (j > i) {
          if (end > count) {
            const length = Math.min(end - count, lineLength)
            res.push(`   |  ` + repeat(`^`, length))
          }
          count += lineLength + 1
        }
      }
      break
    }
  }
  return res.join('\n')
}

function repeat (str, n) {
  let result = ''
  if (n > 0) {
    while (true) { // eslint-disable-line
      if (n & 1) result += str
      n >>>= 1
      if (n <= 0) break
      str += str
    }
  }
  return result
}
