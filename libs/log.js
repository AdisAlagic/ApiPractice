var winston = require('winston');

function getLogger(module) {
    var path = module.filename.split('/').slice(-2).join('/');
    return new winston.createLogger({
        level: 'debug',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(i => `${i.timestamp} | ${i.level} | ${i.message}`)
        ),
        transports: [
            new winston.transports.Console({
                colorized: true,
                label: path
            })
        ]
    })
}

module.exports = getLogger;
