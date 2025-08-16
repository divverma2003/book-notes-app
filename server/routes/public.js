
import express from 'express';
import passport from 'passport';
import db from '../config/db.js';
import bcrypt from 'bcrypt';
import { saltRounds } from '../../index.js';

const router = express.Router();

// Make user available in all EJS views
router.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// ---------------------------------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------------------------------

// Middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  req.flash('error', 'You must be logged in to view this page.');
  res.redirect('/login');
}

// Function to query users given a query, if the query is empty, all users are rendered
const queryUsers = async (query, params = null) => {
  try {
        const users = await db.query(query, params);
        return users.rows;
  } catch (error) {
        console.error('Error querying users:', error);
        throw error;
  }
};

const queryBooks = async (query, params = null) => {
    try {
            const books = await db.query(query, params);
            return books.rows;
    } catch (error) {
            console.error('Error querying books:', error);
            throw error;
    }
}

const queryReviews = async (query, params = null) => {
    try {  
        const reviews = await db.query(query, params);
        return reviews.rows;
    } catch (error) {
        console.error('Error querying reviews:', error);
        throw error;
    }
}

// ---------------------------------------------------------------------------------------------------
// INDEX PAGE ROUTES
// ---------------------------------------------------------------------------------------------------

// GET
// ---------------------------------------------------------------------------------------------------
// ROUTE -> GET: /
router.get('/', async (req, res) => {
    try {
        // Check if user is authenticated
        if (req.isAuthenticated && req.isAuthenticated()) {
            const user_id = req.user.user_id;

            // Fetch user profile
            let query = `
                SELECT name, user_id, email, about, phone_number, 
                       title AS favorite_book_title
                FROM users 
                LEFT JOIN books 
                ON users.favorite_book_id = books.book_id
                WHERE users.user_id = $1
            `;
            let userProfile = await queryUsers(query, [user_id]);
            const user = userProfile[0];

            // Fetch reviews for the user
            query = `
                SELECT *, title AS book_title
                FROM reviews 
                JOIN books ON reviews.book_id = books.book_id
                WHERE user_id = $1
            `;
            const userReviews = await queryReviews(query, [user_id]);

            // Render user dashboard
            return res.render('./admin/userDashboard', {
                title: 'User Dashboard',
                description: 'Manage your book notes and reviews.',
                userProfile: user,
                reviews: userReviews,
                layout: 'layouts/auth',
            });

        } else {
            // Not authenticated → Render index
            return res.render('index', {
                title: 'Book Notes App',
                description: 'A platform to share and discover book notes and reviews.',
                layout: req.user ? 'layouts/auth' : 'layouts/main',
            });
        }
    } catch (error) {
        console.error('Error rendering page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ---------------------------------------------------------------------------------------------------
// LOGIN PAGE ROUTES
// ---------------------------------------------------------------------------------------------------

// GET
// ---------------------------------------------------------------------------------------------------

// ROUTE -> GET: /login
router.get('/login', (req, res) => {
    try {
        res.render('login', {
            title: 'Login',
            description: 'Login to your account to access your book notes and reviews.',
            layout: req.user ? 'layouts/auth' : 'layouts/main',
        });
    } catch (error) {
        console.error('Error rendering login page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// POST
// ---------------------------------------------------------------------------------------------------
// ROUTE -> POST: /login

// Use passport.authenticate as middleware for login
router.post('/login', async (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            req.flash('error', (info && info.message) ? info.message : 'Invalid credentials');
            return res.redirect('/login');
        }
        req.logIn(user, err => {
            if (err) {
                req.flash('error', 'Login failed. Please try again.');
                return next(err);
            }
            req.flash('success', 'Successfully logged in!');
            res.redirect(`/auth/user/${user.user_id}`);
        });
    })(req, res, next);
});

// ---------------------------------------------------------------------------------------------------
// REGISTER PAGE ROUTES
// ---------------------------------------------------------------------------------------------------

// GET
// ---------------------------------------------------------------------------------------------------

// ROUTE -> GET: /register
router.get('/register', async (req, res) => {
    try {
        const result = await queryBooks("SELECT * FROM books");
        res.render('register', {
            title: 'Register',
            description: 'Create a new account to access your book notes and reviews.',
            books: result,
        });
    } catch (error) {
        console.error('Error rendering sign up page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// POST
// ---------------------------------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone_number, about, favorite_book_id, user_color } = req.body;

    // Check if user already exists
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length > 0) {
      req.flash('error', 'Email is already registered. Please log in.');
      return res.redirect('/login');
    }

    // Hash password
    const hash = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const insertResult = await db.query(
      `INSERT INTO users (name, email, password, phone_number, about, favorite_book_id, user_color) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, email, hash, phone_number, about, favorite_book_id, user_color]
    );

    const user = insertResult.rows[0];

    // Log in the user immediately after registration
    req.login(user, (error) => {
      if (error) {
        console.error('Error logging in user after registration:', error);
        return res.status(500).send('Internal Server Error');
      }
      console.log('User logged in:', user);
      res.redirect(`/auth/user/${user.user_id}`);
    });

  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ---------------------------------------------------------------------------------------------------
//  USERS ROUTES
// ---------------------------------------------------------------------------------------------------


// Header GET --> /users
router.get('/users', async (req, res) => {
  try {
    let query = "SELECT name, user_id, email, title AS favorite_book_title FROM users LEFT JOIN books ON users.favorite_book_id = books.book_id";
    const users = await queryUsers(query);
    console.log('Users fetched:', users);
    // Fetch review count for each user
    query = 'SELECT user_id, COUNT(*) as review_count FROM reviews GROUP BY user_id';
    const reviewCounts = await queryReviews(query);

    // Map review counts by user_id for quick lookup

    const reviewCountMap = {};
    if (reviewCounts && reviewCounts.length > 0) {
      reviewCounts.forEach(rc => {
        reviewCountMap[rc.user_id] = parseInt(rc.review_count, 10);
      });
    }

    // Attach review_count and favorite_book_title to each user
    const usersWithCounts = users.map(user => ({
      ...user,
      review_count: reviewCountMap[user.user_id] || 0,
    }));

    // Pagination Logic
    const perPage = 5; // Number of users per page
    const page = req.query.page || 1; // Get the current page from query parameters

    // Calculate pagination
    const totalUsers = users.length; 
    const nextPage = parseInt(page) + 1;
    const hasNextPage = nextPage <= Math.ceil(totalUsers / perPage);

    // Paginate users
    const paginatedUsers = usersWithCounts.slice((page - 1) * perPage, page * perPage);

    res.render('users', {
      title: 'User Management',
      description: 'View users in the system.',
      users: paginatedUsers,
      user: req.user,
      page,
      nextPage: hasNextPage ? nextPage : null,
      layout: req.user ? 'layouts/auth' : 'layouts/main',
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ---------------------------------------------------------------------------------------------------
//  BOOKS ROUTES
// ---------------------------------------------------------------------------------------------------


// Header GET --> /books

router.get('/books', async (req, res) => {
  try {
    const query = "SELECT * FROM books ORDER BY title";
    const books = await queryBooks(query);

    const perPage = 5; // Number of books per page
    const page = req.query.page || 1; // Get the current page from query parameters

    // Calculate pagination
    const totalBooks = books.length; 
    const nextPage = parseInt(page) + 1;
    const hasNextPage = nextPage <= Math.ceil(totalBooks / perPage);

    // Paginate books
    const paginatedBooks = books.slice((page - 1) * perPage, page * perPage);
    res.render('books', {
      title: 'Book Management',
      description: 'Manage books in the system.',
      books: paginatedBooks,
      page,
      nextPage: hasNextPage ? nextPage : null,
      layout: req.user ? 'layouts/auth' : 'layouts/main',
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ---------------------------------------------------------------------------------------------------
// LOGOUT ROUTE
// ---------------------------------------------------------------------------------------------------
// ROUTE -> POST: /logout
router.post('/logout', (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// ---------------------------------------------------------------------------------------------------
// USER ROUTES
// ---------------------------------------------------------------------------------------------------
// ROUTE -> GET: /user/:user_id

router.get('/user/:user_id', async (req, res) => {
  try {
    const user_id = req.params.user_id;
    console.log('Fetching user profile for user_id:', user_id);
    let query = "SELECT name, user_id, email, about, phone_number, title AS favorite_book_title FROM users LEFT JOIN books ON users.favorite_book_id = books.book_id AND users.user_id = $1";
    let userProfile = await queryUsers(query, [user_id]);
    userProfile = userProfile[0]; // Get the first user profile object
    console.log('User profile fetched:', userProfile);
    // Fetch reviews for user
    query = 'SELECT *, title AS book_title FROM reviews JOIN books ON reviews.book_id = books.book_id WHERE user_id = $1';
    const userReviews = await queryReviews(query, [user_id]);

    res.render('user', {
      title: 'User Profile',
      description: 'View a user profile.',
      userProfile,
      userReviews,
      layout: req.user ? 'layouts/auth' : 'layouts/main',
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).send('Internal Server Error');
  }
});


export default router;