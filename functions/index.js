const functions = require('firebase-functions')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const axios = require('axios')
const FormData = require('form-data')
require('dotenv').config()

admin.initializeApp(functions.config().firebase)

db = admin.firestore()
const postListRef = db.collection('posted-posts').doc('post-list')

exports.auto = functions.runWith({ memory: '1GB' }).pubsub
  .schedule('0 21 * * *')
  .timeZone('Asia/Bangkok')
  .onRun(async ctx => {
    const resp = await axios({
      method: 'get',
      url: 'https://reddit.com/r/im14andthisisdeep/top/.json?limit=2',
      headers: {
        'Content-Type': 'application/json'
      },
      data: ''
    })
    let posts = resp.data.data.children
    posts = posts.filter(post => !post.data.over_18)
    const postedPostsReq = await postListRef.get()
    const posteds = postedPostsReq.data().posts
    posts = posts.filter(post => !posteds.includes(post.data.permalink))
    posts.forEach(async post => {
      const title = post.data.title
      const selftext = post.data.selftext
      const params = {
        access_token: process.env.FB_PAGE_ACCESS_TOKEN,
      }
      switch (post.data.post_hint) {
        case 'image':
          if (post.data.is_gallery) {
            const ids = []
            post.data.gallery_data.items.forEach(async item => {
              params.message = item.caption
              params.url = `https://i.redd.it/${item.media_id}.jpg`
              params.published = false
              const upload = await axios.post(`https://graph.facebook.com/${process.env.FB_PAGE_ID}/photos`, {}, { params: params })
              ids.push(upload.data.id)
            })
            const newParams = {
              access_token: process.env.FB_PAGE_ACCESS_TOKEN,
              message: title
            }
            ids.forEach(id => {
              newParams[`attached_media[${ids.indexOf(id)}]`] = `{"media_fbid":"${id}"}`
            })
            await axios.post(`https://graph.facebook.com/${process.env.FB_PAGE_ID}/feed`, {}, { params: params })
          }
          else {
            params.message = title
            params.url = post.data.url
            await axios.post(`https://graph.facebook.com/${process.env.FB_PAGE_ID}/photos`, {}, { params: params })
          }
          break
        case 'video':
          const url = post.data.url
          params.message = `${title}\n${url}`
          await axios.post(`https://graph.facebook.com/${process.env.FB_PAGE_ID}/feed`, {}, { params: params })
          break
        case 'hosted_video':
          const data = new FormData()
          data.append('access_token', process.env.FB_PAGE_ACCESS_TOKEN)
          // data.append('title', title)
          data.append('description', `${title}\n${selftext}`)
          data.append('file_url', post.data.secure_media.reddit_video.fallback_url)
          await axios({
            method: 'post',
            url: `https://graph-video.facebook.com/v13.0/${process.env.FB_PAGE_ID}/videos`,
            headers: {
              ...data.getHeaders()
            },
            data: data
          })
          break
        default:
          params.message = `${title}${selftext ? '\n' + selftext : ''}`
          await axios.post(`https://graph.facebook.com/${process.env.FB_PAGE_ID}/feed`, {}, { params: params })
      }
      await postListRef.update({
        posts: FieldValue.arrayUnion(post.data.permalink)
      })
      functions.logger.info('Added new post to recently posted list.')
    })
    response.send('Successfully fetched posts from Reddit and posted them to Facebook.')
    // response.send('auto() completed.')
  })

exports.clear = functions.runWith({ memory: '1GB' }).pubsub
  .schedule('0 22 * * 0')
  .timeZone('Asia/Bangkok')
  .onRun(async ctx => {
    await postListRef.update({
      posts: []
    })
    response.send('Successfully cleared list of recent posts.')
  })