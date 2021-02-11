const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)

const cors = require('cors')

// Favicon
var favicon = require('serve-favicon')
var path = require('path')

const { ExpressPeerServer } = require('peer')
const peerServer = ExpressPeerServer(server, {debug: true})

const methodOverride = require('method-override')

const flash = require('express-flash')
const session = require('express-session')

const { v4: uuidV4 } = require('uuid')

const bcrypt = require('bcrypt')
const passport = require('passport')

const mongoose = require('mongoose')
const db = require('./config/keys').MongoURI
const User = require('./models/user')


// Passport config
require('./config/passport')(passport)

// Connect with DB
mongoose.connect(db, { 
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('db connect'))
  .catch(err =>  console.log(err))

// EJS engine
app.set('view engine', 'ejs')

app.use(express.static('public'))

// Peerjs
app.use('/peerjs', peerServer)

// Bodyparser
app.use(express.urlencoded({ extended: false }))


// Express Session
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}))

// Passport middleware
app.use(passport.initialize())
app.use(passport.session())

// Connect flash
app.use(flash())

// Global var
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg')
  res.locals.error_msg = req.flash('error_msg')
  res.locals.error = req.flash('error')
  next()
})

app.use(favicon(path.join(__dirname, 'favicon.ico')))

// Method to disconnect
app.use(methodOverride('_method'))

// Cors
app.use(cors())


app.get('/', checkAuthenticated, (req, res) =>{
  res.redirect('/login')
})

app.get('/createroom', checkAuthenticated, (req, res) => {
  res.redirect(`/room${uuidV4()}`)
})

app.get('/room:room', checkAuthenticated, (req, res) => {
  res.render('room', { roomId: req.params.room })
})

app.get('/login', checkNotAuthenticated, (req, res) =>{
  res.render('login.ejs')
})

app.get('/register', checkNotAuthenticated, (req, res) =>{
  res.render('register.ejs')
})

app.post('/register', checkNotAuthenticated, async (req, res) =>{
  const { email, password } = req.body

  errors = []

  if(!email || !password){
    errors.push({ msg: 'Os campos precisam ser preenchidos.' })
    console.log(errors)
  }

  if(password.length < 5) {
    errors.push({ msg: 'A senha deve ser maior que 5 caracteres.' })
    console.log(errors)

  if(errors.length > 0){
    res.render('register', {
      errors,
      email,
      password
    })
  }  
  } else {
    User.findOne({ 
      email: email
    }).then(user => {
      if(user) {
        errors.push({ msg: 'Esse email ja foi usado.' })
        res.render('register.ejs', {
          errors,
          email,
          password
        })
      } else {
        const newUser = new User({
          email,
          password
        })

        bcrypt.genSalt(10, (err, salt) => 
        bcrypt.hash(newUser.password, salt, (err, hash) => {
          if(err) throw err
          newUser.password = hash
          newUser.save()
          .then(user => {
            req.flash('success_msg', 'Você agora está registrado!')
            res.redirect('/login')
          })
          .catch(err => {
            console.log(err)
          })
        }))

      }
    })
  }
})

app.post('/login', checkNotAuthenticated, (req, res, next) => { 
  passport.authenticate('local', {
    successRedirect: '/createroom',
    failureRedirect: '/login',
    badRequestMessage: 'Digite suas credenciais.',
    failureFlash: true
  })(req, res, next);
})

app.delete('/logout', (req, res) => {
  req.logOut()
  res.redirect('/login')
})

function checkAuthenticated(req, res, next){
  if(req.isAuthenticated()){
    return next()
  }
  res.redirect('/login')
}

function checkNotAuthenticated(req, res, next){
  if(req.isAuthenticated()){
    return res.redirect('/')
  }
  next()
}

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId)
    socket.to(roomId).broadcast.emit('user-connected', userId)
    // messages
    socket.on('message', (message) => {
      //send message to the same room
      io.to(roomId).emit('createMessage', message)
  })

    socket.on('disconnect', () => {
      socket.to(roomId).broadcast.emit('user-disconnected', userId)
    })
  })
})

server.listen(process.env.PORT || 80)
