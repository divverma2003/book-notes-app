import express from "express";
import expressEjsLayouts from "express-ejs-layouts";

import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";

import './server/config/db.js';
import db from "./server/config/db.js";

import publicRoutes from "./server/routes/public.js";
import userRoutes from "./server/routes/user.js";
import authRoutes from "./server/routes/auth.js";
import bookRoutes from "./server/routes/book.js";
import reviewRoutes from "./server/routes/review.js";

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

// Routing Middleware
app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/books', bookRoutes);
app.use('/reviews', reviewRoutes);

// Use Layouts
app.use(expressEjsLayouts);
app.use(express.static('public'));
app.set('layout', './layouts/main');

app.use(bodyParser.urlencoded({ extended: true }));

// Session and Authentication Middleware
app.use(passport.initialize());
app.use(passport.session());


passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});