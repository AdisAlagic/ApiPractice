const mysql = require('mysql2');
var log = require('./log')(module);
let conf = require('./config');

const connection = mysql.createConnection({
    host: conf.get("mysql:host"),
    password: conf.get("mysql:password"),
    user: conf.get("mysql:username"),
    database: conf.get("mysql:database"),
});
connection.connect(err => {
    if (err){
        log.error("Connection to Database is failed, reason: " + err.message);
    }else {
        log.info("Connection to Database successful!");
    }
})



module.exports = connection;
