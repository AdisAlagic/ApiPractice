const express = require('express');
const favicon = require('serve-favicon');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const path = require('path');
/**
 * @param app {function}
 */
const app = express();
const logger = morgan("dev");
const conf = require("./libs/config");
const mysql = require("./libs/mysql");
const log = require('./libs/log')(module);
const md5 = require('md5');
const permission = require('./consts/consts');
const datetime = require('node-datetime');
const multer = require('multer');
/**
 * @param upload {multer}
 */
const upload = multer({dest: 'uploads/'})
// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico'))); // отдаем стандартную фавиконку, можем здесь же свою задать
app.use(logger); // выводим все запросы со статусами в консоль
app.use(express.json()); // стандартный модуль, для парсинга JSON в запросах
app.use(bodyParser.urlencoded({
    extended: true
})); // стандартный модуль, для парсинга JSON в запросах
app.use(methodOverride());  // поддержка put и delete
// app.use(app.router); // модуль для простого задания обработчиков путей
app.use(express.static(path.join(__dirname, "public"))); // запуск статического файлового сервера,
// который смотрит на папку public/ (в нашем случае отдает index.html)
//=================================API=====================================

app.get('/api', function (request, result) {
    result.send('{"ver": "v1"}');
});

//=================================Catalog=================================

app.get('/api/v1/catalog', function (request, result) {
    getCatalog(result, request.query.offset, request.query.limit);
});

app.post('/api/v1/catalog', function (request, result) {
    checkForToken(request.query.token).then(value => {
        if (value) {
            addCatalog(result, request.query.name);
        } else {
            printUnauthorized(result);
        }
    });

})

app.delete('/api/v1/catalog', function (request, result) {
    checkForToken(request.query.token).then(value => {
        if (value) {
            deleteCatalog(result, request.query.id);
        } else {
            printUnauthorized(result);
        }
    });

})

app.put('/api/v1/catalog/:catalog_id', function (request, result) {
    checkForToken(request.query.token).then(r => {
        if (r) {
            redactCatalog(result, request.query.name, request.params.catalog_id, request.query.newId);
        } else {
            printUnauthorized(result);
        }
    });

})
//=================================Items=================================

app.get('/api/v1/catalog/:catalog_id', function (request, result) {
    getItemsFromCatalog(result, request.params.catalog_id, request.query.offset,
        request.query.limit, request.protocol + '://' +
        request.get('Host') + request.url);
})

app.post('/api/v1/catalog/:catalog_id', function (request, result) {
    checkForToken(request.query.token).then(value => {
        if (value) {
            addItemToCatalog(result, request.params.catalog_id, request.query.name, request.query.price, request.query.amount);
        } else {
            printUnauthorized(result);
        }
    });

})

app.delete('/api/v1/catalog/:catalog_id/:id', function (request, result) {
    checkForToken(request.query.token).then(value => {
        if (value) {
            deleteItemFromCatalog(result, request.params.catalog_id, request.params.id);
        } else {
            printUnauthorized(result);
        }
    });

})

app.put('/api/v1/catalog/:catalog_id/:id', function (request, result) {
    checkForToken(request.query.token).then(value => {
        if (value) {
            redactItemFromCatalog(result, request.params.catalog_id,
                request.params.id, request.query.newId, request.query.newCatalogId,
                request.query.name, request.query.price, request.query.amount);
        } else {
            printUnauthorized(result);
        }
    });

})

app.get('/api/v1/catalog/:catalog_id/:id', function (request, result) {
    getItemFromCatalog(result, request.params.catalog_id, request.params.id, request.protocol + '://' + request.get('Host') + request.url);
})

//================================ImageUpload==========================

app.post("/api/v1/catalog/:catalog_id/:id/upload", upload.single('image'), function (request, result) {
    checkForToken(request.query.token).then(value => {
        if (value){
            let fileData = request.file;
            log.debug(fileData);
            if (!fileData){
                result.status(400);
                result.send({
                    "error": "can't upload file"
                })
            }else {
                result.send();
            }
            mysql.query("UPDATE items SET image_name = ? WHERE catalog_id = ? AND id = ?",
                [fileData.filename, request.params.catalog_id, request.params.id])
        }else {
            printUnauthorized(result);
        }
    })

})

app.get('/api/v1/catalog/:catalog_id/:id/image', function (request, result) {
    getImage(result, request.params.catalog_id, request.params.id);
})

//=================================Auth=================================

app.post('/api/v1/auth', function (request, result) {
    login(result, request.query.token, request.query.login, request.query.password)
})

//=================================Other=================================

app.listen(conf.get("port"), () => {
    log.info("Listening on " + conf.get("port"));
})

app.use(function (req, res) {
    res.status(404);
    log.debug('Not found URL: ' + req.url);
    res.send({error: 'Not found'});

});

app.use((err, req, res) => {
    res.status(500);
    log.error('Internal error(' + req.statusCode + '): ' + err.message);
    res.send({error: err.message});
});




//---------------------------------API Functions---------------------------------

function getCatalog(result, offset, limit) {
    if (offset === undefined) {
        offset = 0;
    } else {
        offset = parseInt(offset);
    }
    if (limit === undefined) {
        limit = 1000;
    } else {
        limit = parseInt(limit);
    }
    mysql.query("SELECT * FROM `catalog` LIMIT ?, ?", [offset, limit], function (error, results) {
        errorPrint(result, error)
        let js = JSON.stringify(results);
        log.info(js);
        result.send(js);
    });
}

// function getCatalog(result){
//     let js = undefined;
//     mysql.query("SELECT * FROM `catalog`", function (error, results, fields) {
//         js = JSON.stringify(results);
//         log.info(js);
//         result.send(js);
//     });
// }

function addCatalog(result, name) {
    mysql.query("INSERT INTO catalog (name) VALUES (?)", [name], function (error, results, fields) {
        if (error) {
            log.debug(error.message);
            result.status(500);
            result.send({"error": "Server Error"})
        }
        result.send(JSON.stringify(results));
    })
}

function deleteCatalog(result, id) {
    mysql.query("DELETE FROM catalog WHERE id = ?",
        [id],
        function (error, results) {
            errorPrint(result, error);
            result.send(JSON.stringify(results));
        })
}

function redactCatalog(result, name, id, newId) {
    id = checkForDefault(id, -1);
    let first = true;
    let query = "UPDATE Catalog SET ";
    newId = checkForDefault(newId, -1);
    let params = []
    if (name !== undefined) {
        query += "name = ? ";
        params.push(name);
        first = false;
    }
    if (newId >= 0) {
        if (!first) {
            query += ", id = ? ";
        } else {
            query += "id = ? ";
        }
        params.push(newId);
    }
    query += "WHERE id = ?";
    params.push(id)
    mysql.query(query, params, function (error, results) {
        errorPrint(result, error);
        result.send(JSON.stringify(results));
    });
}

function errorPrint(result, error) {
    if (error) {
        result.status(500);
        log.debug(error.message);
        result.send({"error": error.message});
    }
}


//=================================CatalogItems=================================

function getItemsFromCatalog(result, id, offset, limit, url) {
    offset = checkForDefault(offset, 0);
    limit = checkForDefault(limit, 10);
    id = parseInt(id);
    if (typeof (id) !== "number") {
        result.status(400);
        result.send({"error": "id is not a number"});
        return;
    }

    mysql.query("SELECT * FROM items WHERE catalog_id = ? LIMIT ?, ?", [id, offset, limit],
        function (error, results) {
            errorPrint(result, error);
            results.forEach(resulty => {
                resulty.image_url = url + '/' + resulty.id + '/image';
            })
            result.send(JSON.stringify(results));
        }
    )
}

function checkForDefault(number, deflt) {
    if (number === undefined) {
        number = deflt;
        return number;
    }
    number = parseFloat(number);
    if (typeof (number) !== "number") {
        number = deflt;
    }
    return number;
}

function addItemToCatalog(result, catalogId, name, price, amount) {
    catalogId = checkForDefault(catalogId, 0);
    price = checkForDefault(price, 0);
    amount = checkForDefault(amount, 0);
    if (name === undefined) {
        result.status(400);
        result.send({"error": "name not specified!"})
        return;
    }
    mysql.query("INSERT INTO items (catalog_id, name, price, amount) VALUES (?, ?, ?, ?)",
        [catalogId, name, price, amount],
        function (error, results) {
            result.send(JSON.stringify(results));
        }
    );
}

function deleteItemFromCatalog(result, catalogId, id) {
    catalogId = checkForDefault(catalogId, -1);
    id = checkForDefault(id, -1);
    if (id < 0 || catalogId < 0) {
        result.status(400);
        result.send({"error": "catalog_id or id is incorrect"});
        return;
    }
    deleteImageFromItem(catalogId, id);
    mysql.query("DELETE FROM items WHERE catalog_id = ? AND id = ?",
        [catalogId, id],
        function (error, results) {
            errorPrint(result, error);
            result.send(JSON.stringify(results));
        })
}

function deleteImageFromItem(catalogId, id) {
    mysql.query("SELECT * FROM items WHERE catalog_id = ? AND id = ?", [catalogId, id], function (error, results) {
        let fs = require('fs');
        fs.unlinkSync(__dirname + "/uploads/" + results[0].image_name);
    })
}

function getItemFromCatalog(result, catalogId, id, url) {
    catalogId = checkForDefault(catalogId, -1);
    id = checkForDefault(id, -1);
    if (id < 0 || catalogId < 0) {
        result.status(400);
        result.send({"error": "catalog_id or id is incorrect"});
        return;
    }
    mysql.query("SELECT * FROM items WHERE catalog_id = ? AND id = ?",
        [catalogId, id],
        function (error, results) {
        if (results[0] === undefined){
            result.status(404);
            result.send({"error": "Not Found"});
            return;
        }
            results[0].image_url = url + '/image';
            result.send(JSON.stringify(results));
        })
}


function redactItemFromCatalog(result, catalogId, id, newId, newCatalogId, name, price, amount) {
    catalogId = checkForDefault(catalogId, -1);
    id = checkForDefault(id, -1);
    newId = checkForDefault(newId, -1);
    newCatalogId = checkForDefault(newCatalogId, -1);
    price = checkForDefault(price, -1);
    amount = checkForDefault(amount, -1);
    let first = true;
    let query = "UPDATE items SET ";
    let params = [];
    if (newId >= 0) {
        if (first) {
            query += "id = ?";
            first = false;
        } else {
            query += ", id = ?";
        }
        params.push(newId);
    }
    if (newCatalogId >= 0) {
        if (first) {
            query += "catalog_id = ?"
            first = false;
        } else {
            query += ", catalog_id = ?"
        }
        params.push(newCatalogId);
    }
    if (name !== undefined) {
        if (first) {
            query += "name = ?"
            first = false;
        } else {
            query += ", name = ?"
        }
        params.push(name);
    }
    if (price >= 0) {
        if (first) {
            query += "price = ?";
            first = false;
        } else {
            query += ", price = ?";
        }
        params.push(price);
    }
    if (amount >= 0) {
        if (first) {
            query += "amount = ?";
        } else {
            query += ", amount = ?";
        }
        params.push(amount);
    }
    query += " WHERE id = ? AND catalog_id = ?";
    params.push(id);
    params.push(catalogId);
    mysql.query(query, params, function (error, results) {
        errorPrint(result, error);
        result.send(JSON.stringify(results));
    })
}

//==============================AuthFunctions==================================
/**
 * Проверяет, есть ли токен в БД.
 * @param token Токен авторизации
 * @returns {Promise<boolean>}
 */
async function checkForToken(token) {
    let res = false;
    if (token === undefined) {
        return false;
    }
    const q = new Promise((resolve) => {
        mysql.query("SELECT * FROM tokens WHERE token = ?", [token], function (error, results) {
            let temp = true;
            if (results.length === 0) {
                temp = false;
            }else {
                let data = results[0].expire;
                let today = new Date();
                if (today.getTime() > new Date(data).getTime()) {
                    temp = false;
                }
            }
            resolve(temp);
        })
    })
    await q.then(value => {
        res = value;
    })
    return res;
}

/**
 * Создает новый токен
 * @param login {string} Логин пользователя
 * @returns {string} Хешированный токен
 */
function makeToken(login) {
    let expire = new Date();
    expire.setDate(expire.getDate() + 1);
    return md5(expire.getTime() + login + Math.random());
}

/**
 * Создает дату истечения токена авторизации
 * @returns {string} Возвращает строку с форматом данных для БД
 */
function makeExpire() {
    let expire = new Date();
    expire.setDate(expire.getDate() + 1);
    expire = datetime.create(expire.getTime());
    return expire.format("Y-m-d H:M:S");
}

/**
 * Проверяет, есть ли пользователь в БД и совпадают ли данные логина и пароля.
 * @param login Логин пользователя
 * @param hashedPassword Уже захешированный пароль
 * @returns {Promise<void>}
 */
async function checkForUser(login, hashedPassword) {
    let res = undefined;
    const q = new Promise((resolve, reject) => {
        mysql.query("SELECT * FROM users WHERE user = ? AND password = ?",
            [login, hashedPassword],
            function (error, results) {
                if (results.length === 0) {
                    resolve(false)
                } else {
                    deleteTokenIfNecessary(results).then(function () {//TODO: Fix no respond
                        checkForTokenExistsInDb(login).then(value => {
                                let temp = false;
                                if (value) {
                                    temp = true;
                                } else {
                                    insertNewToken(login, results);
                                }
                                temp = true;
                                resolve(temp);
                            }
                        )
                    });
                }
            })
    })
    await q.then(value => {
        res = value;
    });
    return res;
}

/**
 * Удаляет токен, если он истек
 * @param resultSet {Array} Массив с данными (в виде объектов) о пользователе
 * @returns {Promise<unknown>} Ничего
 */
async function deleteTokenIfNecessary(resultSet) {
    if (resultSet.length === 0) {
        return;
    }
    const q = new Promise(resolve => {
        mysql.query("SELECT * FROM tokens WHERE user_id = ?", [resultSet[0].id], function (error, results) {
            if (results.length === 0) {
                resolve();
                return;
            }
            checkForToken(results[0].token).then(value => {
                if (!value) {
                    mysql.query("DELETE FROM tokens WHERE user_id = ?", [resultSet[0].id]);
                    resolve();
                } else {
                    resolve();
                }
            })
        });

    })
    return await q;
}

/**
 * Проверяет, существует ли токен в БД
 * @param login Логин пользователя
 * @returns {Promise<boolean>}
 */
async function checkForTokenExistsInDb(login) {
    let res = false;
    const q = new Promise((resolve, reject) => {
        mysql.query("SELECT * FROM tokens WHERE user_id = (SELECT user_id FROM users WHERE user = ?)",
            [login],
            function (error, results) {
                let temp = results.length !== 0;
                resolve(temp);
            })
    })
    await q.then(value => {
        res = value;
    });
    return res;
}

/**
 * Добавляет в базу данных новый токен и его срок годности
 * @param login Логин пользователя
 * @param results {Array} Массив с данными (в виде объектов) о пользователе
 */
function insertNewToken(login, results) {
    let token = makeToken(login);
    let expire = makeExpire();
    mysql.query("INSERT INTO tokens (user_id, token, expire) VALUES (?, ?, ?)",
        [results[0].id, token, expire])
}

/**
 * Возвращает роль пользователя
 * @param token Токен авторизации
 * @returns {Promise<void>}
 */
async function getRole(token) {
    let role = undefined;
    if (token === undefined) {
        return;
    }
    const q = new Promise(resolve => {
        mysql.query("SELECT role FROM users WHERE id = (SELECT user_id FROM tokens WHERE token = ?)",
            [token],
            function (error, results) {
                if (results.length === 0) {
                    resolve();
                } else {
                    resolve(results[0].role);
                }
            })
    })
    await q.then(value => {
        role = value;
    })
    return role;
}

/**
 * Возвращает токен авторизации
 * @param login Логин пользователя
 * @returns {Promise<string>}
 */
async function getToken(login) {
    let t = "";
    const q = new Promise(resolve => {
        mysql.query("SELECT * FROM tokens WHERE user_id = (SELECT user_id FROM users WHERE user = ?)",
            [login], function (error, results) {
                let token = undefined;
                if (results.length !== 0) {
                    token = results[0];
                    mysql.query("SELECT role FROM users WHERE user = ?", [login], function (error, resultSet) {
                        token.role = resultSet[0].role;
                        resolve(token);
                    })
                } else {
                    resolve(token);
                }
            })
    })
    await q.then(value => {
        t = value;
    })
    return t;
}

/**
 * Отправляет пользователю результат в виде токена и роли. Если данные не корректны,
 * то отправляет 401 ошибку. Пользователь дает либо токен, либо логин пароль.
 * Первым проверяется токен. Если он не верный, отдает 401, не смотря на логин и пароль.
 * @param result Отправитель сообщений
 * @param token Токен пользователя
 * @param login Логин пользователя
 * @param password Пароль пользователя
 */
function login(result, token, login, password) {
    if (token !== undefined) {
        checkForToken(token).then(value => {
            if (!value) {
                result.status(403);
                result.send();
            } else {
                getRole(token).then(r => {
                    result.send({
                        "token": token,
                        "role": r
                    })
                })
            }
        })
    } else {
        let hashedPassword = md5(password + login);
        checkForUser(login, hashedPassword).then(value => {
            if (!value) {
                result.status(401);
                result.send();
            } else {
                getToken(login).then(value1 => {
                    result.send({
                        "token": value1.token,
                        "role": value1.role
                    })
                })
            }
        })
    }
}

function printUnauthorized(result) {
    result.status(401);
    result.send();
}

//==================================Image===============================

function getImage(result, catalogId, id) {
    catalogId = checkForDefault(catalogId, -1);
    id = checkForDefault(id, -1);
    if (catalogId < 0 || id < 0){
        result.status(401);
        result.send({'error': 'catalog_id or id is incorrect'})
        return;
    }
    result.set({'Content-Type': 'image/png'});
    mysql.query('SELECT image_name FROM items WHERE catalog_id = ? AND id = ?', [catalogId, id],
        function (error, results) {
            if (results[0].image_name === null){
                result.status(404);
                result.send();
                return;
            }
            let file = __dirname + '/uploads/' + results[0].image_name;
            let fs = require('fs');
            file = fs.readFileSync(file);
            result.send(file);
        });
}
