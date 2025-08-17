import express from "express";
import expressEjsLayouts from "express-ejs-layouts";
import flash from "connect-flash";

import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import axios from 'axios';

import './server/config/config.js';
import db from './server/config/db.js';


import publicRoutes from "./server/routes/public.js";
import authRoutes from "./server/routes/auth.js";

const app = express();
const port = 3000;
const saltRounds = 10;

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// TODO:
// INDEX: ADD GOOGLE AUTH + EMAIL CONFIRMATION + PASSWORD CHANGE CONFIRMATION

// Use Layouts
app.use(expressEjsLayouts);
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());


// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('layout', './layouts/main');


// Flash messages middleware
app.use(flash());

// Pass flash messages to all views
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// Session and Authentication Middleware
app.use(passport.initialize());
app.use(passport.session());


passport.use(
  new Strategy({ usernameField: 'email' },async function verify(email, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
      console.log('Query result:', result.rows[0]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHash = user.password;
        bcrypt.compare(password, storedHash, (error, isMatch) => {
          if (error) {
            console.error('Error comparing passwords:', error);
            return cb(error);
          }
          else if (isMatch) {
            return cb(null, user);
          } else {
            return cb(null, false, { message: 'Incorrect password.' });
          }
        });
      }
      else {
        return cb(null, false, { message: 'User not found.' });
      }
    } catch (error) {
      console.error('Error during authentication:', error);
      return cb(error);
    }
  })
);
passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

// Routing Middleware
app.use('/', publicRoutes);
app.use('/auth', authRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export { app, saltRounds };