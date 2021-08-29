const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    if (password.length >= 6) {
      const insertUserQuery = `INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        );`;
      await db.run(insertUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "Ganesh@123");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authorizationToken = (request, response, next) => {
  let jwtToken;
  const authorizedHeader = request.headers["authorization"];
  if (authorizedHeader !== undefined) {
    jwtToken = authorizedHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Ganesh@123", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authorizationToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userProfile = await db.get(getUserDetails);
  const { name, user_id } = userProfile;
  console.log(user_id);
  const getTweetsQuery = `SELECT
  user.username AS username,
  tweet.tweet as tweet,
  tweet.date_time as dateTime
  FROM 
  user INNER JOIN tweet
  ON user.user_id=tweet.user_id
  WHERE user.user_id IN 
  (SELECT 
    following_user_id 
    FROM 
    follower 
    WHERE follower_user_id=${user_id})
  ORDER BY dateTime DESC 
  limit 4;`;
  const followingTweets = await db.all(getTweetsQuery);
  response.send(followingTweets);
  console.log(followingTweets);
});

app.get("/user/following/", authorizationToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userProfile = await db.get(getUserDetails);
  const { name, user_id } = userProfile;
  console.log(user_id);
  const getFollowingUserQuery = `SELECT
  user.name AS name
  FROM user 
  WHERE user.user_id IN 
  (SELECT 
    following_user_id 
    FROM 
    follower 
    WHERE 
    follower_user_id=${user_id});`;
  const userNames = await db.all(getFollowingUserQuery);
  response.send(userNames);
});

app.get("/user/followers/", authorizationToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userProfile = await db.get(getUserDetails);
  const { name, user_id } = userProfile;
  console.log(user_id);
  const getFollowerQuery = `SELECT 
  user.name 
  FROM user 
  WHERE user.user_id IN 
  (SELECT 
    follower_user_id 
    FROM 
    follower WHERE 
    following_user_id=${user_id});`;
  const followerNames = await db.all(getFollowerQuery);
  response.send(followerNames);
});

app.get("/tweets/:tweetId/", authorizationToken, async (request, response) => {
  let { username } = request;
  console.log(username);
  const { tweetId } = request.params;
  const getTweetsQuery = `SELECT 
    user_id 
    FROM 
    tweet 
    WHERE tweet_id=${tweetId} AND user_id IN (SELECT 
        follower.following_user_id 
        FROM 
        user INNER JOIN follower ON user.user_id= follower.follower_user_id 
        WHERE user.username='${username}');`;
  const userId = await db.get(getTweetsQuery);
  console.log(userId);
  if (userId === undefined) {
    response.status(401);
    response.send("Invalid Request");
    console.log("Invalid Request");
  } else {
    const getTweetLikesQuery = `SELECT 
      T.tweet,
      COUNT(T.like_id) AS likes,
      COUNT(reply.reply_id) AS replays,
      tweet.date_time AS dateTime
      FROM 
      (tweet LEFT JOIN like 
      ON tweet.tweet_id=like.tweet_id)AS T 
      LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id
      WHERE T.tweet_id=${tweetId}
      ;`;
    const tweetDetails = await db.get(getTweetLikesQuery);
    response.send(tweetDetails);
    console.log(tweetDetails);
  }
});

const createListAndPushToList = (userNames) => {
  const likes = [];
  for (let eachname of userNames) {
    let { username } = eachname;
    likes.push(username);
  }
  return { likes };
};

app.get(
  "/tweets/:tweetId/likes/",
  authorizationToken,
  async (request, response) => {
    let { username } = request;
    console.log(username);
    const { tweetId } = request.params;
    const getTweetsQuery = `SELECT 
    user_id 
    FROM 
    tweet 
    WHERE tweet_id=${tweetId} AND user_id IN (SELECT 
        follower.following_user_id 
        FROM 
        user INNER JOIN follower ON user.user_id= follower.follower_user_id 
        WHERE user.username='${username}');`;
    const userId = await db.get(getTweetsQuery);
    console.log(userId);
    if (userId === undefined) {
      response.status(401);
      response.send("Invalid Request");
      console.log("Invalid Request");
    } else {
      const getUserLikedQuery = `SELECT 
    user.username FROM 
    (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) AS T 
    INNER JOIN user ON user.user_id=like.user_id 
    WHERE tweet.tweet_id=${tweetId};`;
      const userNames = await db.all(getUserLikedQuery);
      const nameObject = createListAndPushToList(userNames);
      response.send(nameObject);
    }
  }
);

const createListAndPushObjectToList = (replyObject) => {
  const replies = [];
  for (let eachObj of replyObject) {
    replies.push(eachObj);
  }
  return { replies };
};

app.get(
  "/tweets/:tweetId/replies/",
  authorizationToken,
  async (request, response) => {
    let { username } = request;
    console.log(username);
    const { tweetId } = request.params;
    const getTweetsQuery = `SELECT 
    user_id 
    FROM 
    tweet 
    WHERE tweet_id=${tweetId} AND user_id IN (SELECT 
        follower.following_user_id 
        FROM 
        user INNER JOIN follower ON user.user_id= follower.follower_user_id 
        WHERE user.username='${username}');`;
    const userId = await db.get(getTweetsQuery);
    console.log(userId);
    if (userId === undefined) {
      response.status(401);
      response.send("Invalid Request");
      console.log("Invalid Request");
    } else {
      const getUserReplayQuery = `
      SELECT 
      user.name,
      reply.reply
      FROM (tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id) AS T 
      INNER JOIN user ON reply.user_id=user.user_id
      WHERE tweet.tweet_id=${tweetId} 
      GROUP BY user.user_id;`;
      const userReplys = await db.all(getUserReplayQuery);
      const objectArray = createListAndPushObjectToList(userReplys);
      response.send(objectArray);
      console.log(objectArray);
    }
  }
);

app.get("/user/tweets/", authorizationToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userProfile = await db.get(getUserDetails);
  const { name, user_id } = userProfile;
  const getUserTweetsQuery = `SELECT 
  tweet.tweet,
  COUNT(like.like_id) AS likes,
  COUNT(reply.reply) AS replies,
  tweet.date_time AS dateTime
  FROM 
  (tweet LEFT JOIN like ON tweet.user_id=like.user_id)AS T 
  LEFT JOIN reply ON T.user_id=reply.user_id 
  WHERE T.user_id=${user_id}
  GROUP BY T.tweet_id;`;
  const userTweet = await db.all(getUserTweetsQuery);
  response.send(userTweet);
});

app.post("/user/tweets/", authorizationToken, async (request, response) => {
  let { username } = request;
  const { tweet } = request.body;
  console.log(request);
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const userProfile = await db.get(getUserDetails);
  const { name, user_id } = userProfile;
  let date_time;
  const insertQuery = `INSERT INTO tweet(tweet,user_id) 
  VALUES('${tweet}',${user_id})`;
  await db.run(insertQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authorizationToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserQuery = `SELECT user_id FROM tweet 
    WHERE tweet_id=${tweetId} AND user_id = (SELECT user_id FROM user WHERE username='${username}');`;
    const userId = await db.get(getUserQuery);
    //const { user_id } = userId;
    console.log(userId);
    if (userId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
/*const dateNow = new Date();
  const presentDatetime = `${dateNow.getFullYear()}-${dateNow.getMonth() + 1}-
  ${dateNow.getDate()} ${dateNow.getHours()}:${dateNow.getMinutes()}:${dateNow.getSeconds()}`;
  console.log(presentDatetime);*/
