// #region .yaml support
const YAML = require('yaml')
const fs = require('fs')
require.extensions['.yml'] = function(module, filename) {
  module.exports = YAML.parse(fs.readFileSync(filename, 'utf8'))
}
// #endregion .yaml support
const { LoggerFactory } = require('logger.js')
const { Translate } = require('@google-cloud/translate')
const fetch = require('node-fetch')
const logger = LoggerFactory.getLogger('client', 'cyan').config(true)
const Discord = require('discord.js')
const config = require('./config.yml')
const projectId = config.project_id
const keyFilename = config.private_key_file
const translate = new Translate({ projectId, keyFilename })
const client = new Discord.Client()
const getEmbed = async message => {
  const regexp1 = /(["]|[`])(.*?)(["]|[`])/
  const text = (regexp1).test(message) ? regexp1.exec(message)[2] : ((/\s/g).test(message) ? message.split(/\s/g)[0] : message)
  let [ detections ] = await translate.detect(text)
  detections = Array.isArray(detections) ? detections : [detections]
  const lang = detections[0].language
  const { query: { pages } } = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvsection=0&titles=${encodeURIComponent(text)}&rvslots=main&format=json`).then(res => res.json())
  let page
  try { // eslint-disable-line no-restricted-syntax
    page = Object.values(pages)[0]['revisions'][0]['slots']['main']['*']
  } catch (ignored) {
    return
  }
  const short_description = /{{short description\|(.*?)}}/.exec(page)
  const embed = new Discord.RichEmbed()
  const wiki = word => encodeURI(`https://${lang}.wikipedia.org/wiki/${word}`)
  let link = 0
  const wikimd = word => {
    link++
    if (embed.fields.length === 24) {
      embed.setFooter(`${link-23} links were omitted`)
    }
    word = word.includes('|') ? word.split('|')[0] : word
    if (embed.fields.length < 24) embed.addField(`[${link}] (${word})`, `${wiki(word)}`)
    return `*${word}[${link}]*`
  }
  let pageText = page.length >= 2045 ? page.substring(0, 2045) + '...' : page
  pageText = pageText.replace(/{{.*?}}/gm, '')
  pageText = pageText.replace(/'''''(.*?)'''''/g, (match, p1) => `***${p1}***`)
  pageText = pageText.replace(/'''(.*?)'''/g, (match, p1) => `**${p1}**`)
  pageText = pageText.replace(/''(.*?)''/g, (match, p1) => `*${p1}*`)
  pageText = pageText.replace(/\[\[(.*?)\]\]/g, (match, p1) => wikimd(p1))
  pageText = pageText.replace(/<ref.*?>.*?<\/ref>/gm, '')
  embed.setColor([0,255,0])
  embed.setTitle(text)
  embed.setURL(`https://${lang}.wikipedia.org/wiki/${text}`)
  embed.setDescription(pageText)
  if (short_description) embed.addField('Short description', short_description[1])
  return embed
}

client.on('ready', () => {
  client.user.setActivity('React with 🤔')
  logger.info('Logged in as ' + client.user.tag)
})

logger.info('Logging in...')
client.login(config['token'])

process.on('SIGINT', async () => {
  await client.destroy()
  logger.info('Successfully disconnected from Discord.')
  process.exit()
})

client.on('message', async msg => {
  if (!msg.mentions.users.has(msg.client.user.id)) return
  const mention = msg.guild.me.user.toString()
  const content = msg.content.replace(`${mention} `, '').replace(mention, '')
  msg.channel.send(await getEmbed(content))
})

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return
  if (reaction.emoji.name !== '🤔') return
  if (reaction.count > 1) return
  const msg = reaction.message
  reaction.message.channel.send(await getEmbed(msg.content))
})
