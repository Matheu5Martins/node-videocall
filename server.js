const express = require('express')
const app = express()
const cors = require('cors')
const server = require('http').Server(app)
const io = require('socket.io')(server)
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

mongoose.connect(db, { 
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('db connect'))
  .catch(err =>  console.log(err))

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use('/peerjs', peerServer)
app.use(express.urlencoded({ extended: false }))
app.use(flash())
app.use(session({
  secret: 'aaaaaaaaaaaaaaa',
  resave: false,
  saveUninitialized: true
}))

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg')
  res.locals.error_msg = req.flash('error_msg')
  next()
})
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))
app.use(cors())

app.get('/', checkAuthenticated, (req, res) =>{
  res.render('index.ejs', { name: req.body.name })
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
            req.flash('success_msg', 'Você agora está registrado.')
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

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/createroom',
  failureRedirect: '/login',
  failureFlash: true
}))

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
