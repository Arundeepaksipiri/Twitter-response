const express = require('express')
const app = express()
app.use(express.json())
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null
const initializeDBAndServer = async () => {
  try {
    app.listen(3000, () => {
      console.log('Server starting http://localhost:3000/')
    })
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
  } catch (e) {
    console.log(`DB Erroe ${e.message}`)
  }
}
initializeDBAndServer()
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(request.body.password, 10)
  const selectedUserQuery = `
  SELECT * FROM user WHERE username='${username}'`
  const dbUser = await db.get(selectedUserQuery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const createUserQuery = `
    INSERT INTO user (username,password,name,gender)
    VALUES(
      '${username}',
      '${hashedPassword}',
      '${name}',
      '${gender}'
    )`
      await db.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const twitterQuery = `
  SELECT * FROM user WHERE username='${username}'`
  const dbUser = await db.get(twitterQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  let {username} = request
  const userQuery = `
  SELECT * FROM user WHERE username='${username}'`
  const dbUser = await db.get(userQuery)
  const twitterQuery = `
  SELECT user.username as username, tweet.tweet as tweet ,
  tweet.date_time as dateTime from (user INNER JOIN follower ON user.user_id=
  follower.following_user_id) as T INNER JOIN tweet ON T.user_id=tweet.user_id WHERE 
  follower.follower_user_id=${dbUser.user_id} ORDER BY tweet.date_time DESC LIMIT 4
  `
  const twitterArray = await db.all(twitterQuery)
  response.send(twitterArray)
})
app.get('/user/following/', authenticateToken, async (request, response) => {
  let {username} = request
  const userQuery = `
  SELECT * FROM user WHERE username='${username}'`
  const dbUser = await db.get(userQuery)
  const twitterQuery = `
  SELECT user.name as name FROM user INNER JOIN follower ON follower.following_user_id=user.user_id 
  WHERE follower.follower_user_id=${dbUser.user_id}`
  const twitterArray = await db.all(twitterQuery)
  response.send(twitterArray)
})
app.get('/user/followers/', authenticateToken, async (request, response) => {
  let {username} = request
  const userQuery = `
  SELECT * FROM user WHERE username='${username}'`
  const dbUser = await db.get(userQuery)
  const twitterQuery = `
  SELECT user.name as name from user INNER JOIN follower ON 
  user.user_id=follower.follower_user_id WHERE follower.following_user_id=
  ${dbUser.user_id}`
  const twitterArray = await db.all(twitterQuery)
  response.send(twitterArray)
})
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  let {tweetId} = request.params
  let {username} = request
  const tQuery = `
  SELECT * FROM user WHERE username='${username}'`
  const tArray = await db.get(tQuery)
  const userQuery = `
  SELECT * FROM tweet WHERE tweet_id=${tweetId}`
  const dbUser = await db.get(userQuery)
  const twitterQuery = `
  SELECT * FROM follower INNER JOIN user ON
  follower.following_user_id=user.user_id WHERE 
  follower.follower_user_id=${tArray.user_id}`
  const twitterArray = await db.all(twitterQuery)
  if (twitterArray.some(item => item.following_user_id === dbUser.user_id)) {
    const myQuery = `
    SELECT tweet.tweet as tweet, count(like.like_id) as likes,
    count(reply.reply_id) as replies, tweet.date_time as
    dateTime FROM (tweet INNER JOIN like ON
    tweet.user_id = like.user_id) AS T INNER JOIN reply ON
    T.user_id=reply.user_id WHERE tweet.tweet_id=${tweetId}
    GROUP BY T.user_id


    `
    const myArray = await db.get(myQuery)
    response.send(myArray)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    let {tweetId} = request.params
    let {username} = request
    const userQuery = `
  SELECT * FROM user WHERE username='${username}'`
    const dbUser = await db.get(userQuery)
    const twitterQuery = `
  SELECT * FROM tweet INNER JOIN follower ON
  follower.following_user_id=tweet.user_id WHERE 
  tweet.tweet_id=${tweetId} AND 
  follower.follower_user_id=${dbUser.user_id}`
    const twitterArray = await db.all(twitterQuery)
    response.send(twitterArray)

    if (twitterArray === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const myQuery = `
    SELECT user.username FROM (user INNER JOIN like
    ON user.user_id= like.user_id) as T INNER JOIN
    tweet ON T.user_id=tweet.user_id WHERE tweet.tweet_id=${tweetId} 
    GROUP BY tweet.tweet_id`
      const myArray = await db.get(myQuery)
      response.send(myArray)
    }
  },
)
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    let {tweetId} = request.params
    let {username} = request
    const userQuery = `
  SELECT * FROM user WHERE username='${username}'`
    const dbUser = await db.get(userQuery)
    const twitterQuery = `
  SELECT * FROM tweet INNER JOIN follower ON
  follower.following_user_id=tweet.user_id WHERE 
  tweet.tweet_id=${tweetId} AND 
  follower.follower_user_id=${dbUser.user_id}`
    const twitterArray = await db.get(twitterQuery)

    if (twitterArray === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const myQuery = `
    SELECT user.username as name,reply.reply FROM (user INNER JOIN reply
    ON user.user_id= reply.user_id) as T INNER JOIN
    tweet ON T.user_id=tweet.user_id WHERE tweet.tweet_id=${tweetId} 
    GROUP BY tweet.tweet_id`
      const myArray = await db.all(myQuery)
      response.send(myArray)
    }
  },
)
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  let {username} = request
  const userQuery = `
  SELECT * FROM user WHERE username='${username}'`
  const dbUser = await db.get(userQuery)
  const twitterQuery = `
  SELECT * from (user INNER JOIN follower ON user.user_id=
  follower.following_user_id) as T 
  INNER JOIN tweet ON T.user_id=tweet.user_id WHERE follower.follower_user_id=
  ${dbUser.user_id}`
  const twitterArray = await db.all(twitterQuery)
  const userTweet = tweet => {
    const myQuery = `
    SELECT tweet.tweet as tweet,
    count(like.like_id) as likes, count(reply.reply)
    as replies, tweet.date_time as dateTime from
    (tweet INNER JOIN like ON tweet.user_id=like.user_id)
    AS T INNER JOIN reply ON T.user_id=reply.user_id
    WHERE tweet.tweet_id=${tweet.tweet_id}`
    return db.get(myQuery)
  }
  response.send(twitterArray.map(tweet => userTweet(tweet)))
})
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    let {tweetId} = request.params
    let {username} = request
    const twitterQuery = `
  SELECT * FROM user WHERE username='${username}'`
    const dbUser = await db.get(twitterQuery)
    const myQuery = `
  SELECT * FROM tweet WHERE tweet_id=${tweetId} AND 
  user_id=${dbUser.user_id}`
    const myArray = await db.get(myQuery)
    if (myArray === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const arunQuery = `
      DELETE FROM tweet WHERE tweet_id=${tweetId}`
      await db.run(arunQuery)
      response.send('Tweet Removed')
    }
  },
)
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  let {username} = request
  let {tweet} = request.body
  const twitterQuery = `
  SELECT * FROM user where username='${username}'`
  const twitterArray = await db.get(twitterQuery)
  const myQuery = `
  INSERT INTO tweet (tweet)
  VALUES(
    '${tweet}'
  )`
  await db.run(myQuery)
  response.send('Created a Tweet')
})

module.exports = app
