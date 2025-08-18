import express from 'express';
import passport from 'passport';
import db from '../config/db.js';
import bcrypt from 'bcrypt';
import { saltRounds } from '../../index.js';
import axios from 'axios';

const router = express.Router();

const genres = [
  "Fiction","Nonfiction","Biography","Science","Fantasy",
  "Mystery","Romance","History","Children","Computer Science","Young Adult",
  "Thriller","Horror","Self-Help","Graphic Novel","Classic",
  "Adventure","Poetry","Programming","Science Fiction","Memoir","Travel","Technology",
  "Spirituality","Cookbook","Art","Business","Health",
  "Politics","Philosophy","Short Stories","Humor","Other"
];

// ----------------------
// Middleware
// ----------------------
router.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated?.()) return next();
  req.flash('error', 'You must be logged in to view this page.');
  res.redirect('/login');
}

// ----------------------
// Helper Query Functions
// ----------------------
const queryDb = async (query, params = []) => {
  try {
    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

const queryUsers = (query, params = []) => queryDb(query, params);
const queryBooks = (query, params = []) => queryDb(query, params);
const queryReviews = (query, params = []) => queryDb(query, params);

// ----------------------
// API Helpers
// ----------------------
const API_BOOK_COVERS_ENDPOINT = 'https://covers.openlibrary.org/b/isbn';
const API_BOOKS_ENDPOINT = 'https://openlibrary.org/isbn/';

const bookExists = async (isbn13) => {
  try {
    const response = await axios.get(`${API_BOOKS_ENDPOINT}${isbn13}.json`);
    return response.status === 200;
  } catch {
    return false;
  }
};

const validateAndFetchBook = async (isbn) => {
  try {
    isbn = isbn.replace(/-/g, '');
    if (!(await bookExists(isbn))) {
      return { success: false, message: 'Book not found! Try another ISBN.' };
    }
    return {
      success: true,
      found_url: `${API_BOOK_COVERS_ENDPOINT}/${isbn}-L.jpg`,
      isbn
    };
  } catch (error) {
    console.error('Error validating ISBN:', error);
    return { success: false, message: 'An error occurred while validating the ISBN.' };
  }
};

// ----------------------
// Render Functions
// ----------------------
// Helper function: render user dashboard
async function renderUserDashboard(req, res) {
  try {
    if (!req.user) {
      req.flash('error', 'Please log in to view your dashboard.');
      return res.redirect('/login');
    }

    const userId = req.user.user_id;

    // Fresh query: user info + favorite book
    let query = `
      SELECT u.user_id, u.name, u.email, u.about, u.phone_number, u.user_color,
             b.title AS favorite_book_title
      FROM users u
      LEFT JOIN books b ON u.favorite_book_id = b.book_id
      WHERE u.user_id = $1
    `;
    const userResult = await queryUsers(query, [userId]);
    const userProfile = userResult[0];

    if (!userProfile) {
      return res.status(404).send('User not found');
    }

    // Query: review count
    query = `SELECT COUNT(*) as review_count FROM reviews WHERE user_id = $1`;
    const reviewResult = await queryReviews(query, [userId]);
    const reviewCount = reviewResult[0]?.review_count || 0;

    // Query: reviews
    const userReviews = await queryReviews(
      `SELECT *, title AS book_title 
       FROM reviews 
       JOIN books ON reviews.book_id = books.book_id 
       WHERE user_id = $1`,
      [userId]
    );
    
    query = 'SELECT *, title AS book_title FROM reviews JOIN books ON reviews.book_id = books.book_id WHERE user_id = $1';

    // Query: books that the user HASN'T REVIEWED
    const books = await queryBooks(`
      SELECT * FROM books
      WHERE book_id NOT IN (
        SELECT book_id FROM reviews WHERE user_id = $1
      )
    `, [userId]);

    // Merge everything into the profile
    const userWithCounts = {
      ...userProfile,
      review_count: parseInt(reviewCount, 10),
    };

    // Render the dashboard with fresh data
    res.render('./admin/userDashboard', {
      title: 'Your Dashboard',
      description: 'View your profile, favorite book, and reviews.',
      user: userWithCounts,
      reviews: userReviews,
      books,
      layout: 'layouts/auth'
    });

  } catch (error) {
    console.error('Error rendering user dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
}


// ----------------------
// Routes
// ----------------------

// GET: User Dashboard
router.get('/user/:user_id', ensureAuthenticated, (req, res) => {
  renderUserDashboard(req, res);
});

// GET: Edit User
router.get('/user/:user_id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const books = await queryBooks("SELECT * FROM books");
    res.render('userForm', {
      title: 'Edit User',
      description: 'Update your account information.',
      books,
    });
  } catch (error) {
    console.error('Error rendering user edit page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// GET: Edit Book Form
router.get('/:book_id/edit-book', ensureAuthenticated, async (req, res) => {
  try {
    const [book] = await queryBooks('SELECT * FROM books WHERE book_id = $1', [req.params.book_id]);

    if (!book) {
      req.flash('error', 'Book not found.');
      return res.redirect('/');
    }

    book.date_published = book.date_published
      ? new Date(book.date_published).toISOString().split('T')[0]
      : '';

    res.render('./admin/bookForm', {
      title: 'Edit Book',
      description: 'Edit the details of the book.',
      book,
      genres,
      layout: 'layouts/auth'
    });
  } catch (error) {
    console.error('Error rendering edit book page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// GET: Add Book Form
router.get('/add-book', ensureAuthenticated, (req, res) => {
  res.render('./admin/bookForm', {
    title: 'Add Book',
    description: 'Add a new book to your collection.',
    book: null,
    genres,
    layout: 'layouts/auth'
  });
});

// ----------------------
// POST Routes
// ----------------------

// POST: Edit User
router.post('/user/:user_id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const { user_id } = req.params;
    const [user] = await queryUsers('SELECT * FROM users WHERE user_id = $1', [user_id]);

    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/auth/users');
    }

    const { name, email, password, about, phone_number, favorite_book_id, user_color } = req.body;

    if (!name || !email) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect(`/auth/user/${user_id}/edit`);
    }

    if (password) {
      if (await bcrypt.compare(password, user.password)) {
        req.flash('error', 'New password must be different from the old password.');
        return res.redirect(`/auth/user/${user_id}/edit`);
      }
      const hash = await bcrypt.hash(password, saltRounds);
      await db.query(
        `UPDATE users
         SET name=$1, email=$2, about=$3, phone_number=$4, favorite_book_id=$5,
             user_color=$6, password=$7
         WHERE user_id=$8`,
        [name, email, about, phone_number || null, favorite_book_id || null, user_color, hash, user_id]
      );
      req.flash('success', 'User and password updated successfully!');
    } else {
      await db.query(
        `UPDATE users
         SET name=$1, email=$2, about=$3, phone_number=$4, favorite_book_id=$5,
             user_color=$6
         WHERE user_id=$7`,
        [name, email, about, phone_number || null, favorite_book_id || null, user_color, user_id]
      );
      req.flash('success', 'User updated successfully!');
    }

    // Render dashboard directly with fresh data
    return renderUserDashboard(req, res, user_id);

  } catch (error) {
    console.error('Error updating user:', error);
    req.flash('error', 'Server error: Unable to update user.');
    return res.redirect(`/auth/user/${req.params.user_id}/edit`);
  }
});

// POST: Delete User
router.post('/user/:user_id/delete', ensureAuthenticated, async (req, res) => {
  try {
    const { user_id } = req.params;
    const [user] = await queryUsers('SELECT * FROM users WHERE user_id = $1', [user_id]);

    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/auth/users');
    }

    await db.query('DELETE FROM users WHERE user_id = $1', [user_id]);
    req.flash('success', 'User deleted successfully.');
    return res.redirect('/');
  } catch (error) {
    console.error('Error deleting user:', error);
    req.flash('error', 'Server error: Unable to delete user.');
    return res.redirect(`/auth/user/${req.params.user_id}`);
  }
});

// POST: Validate ISBN
router.post('/validate-isbn', ensureAuthenticated, async (req, res) => {
  try {
    const { isbn13 } = req.body;
    if (!isbn13) return res.json({ success: false, message: 'ISBN is required.' });

    const validationResult = await validateAndFetchBook(isbn13);
    if (!validationResult.success) {
      return res.json({ success: false, message: validationResult.message });
    }
    const { found_url, isbn } = validationResult;
    return res.json({ success: true, found_url, isbn });
  } catch (error) {
    console.error('Server Error:', error);
    return res.json({ success: false, message: 'Server error occurred while validating ISBN.' });
  }
});

// POST: Add Book
router.post('/add-book', ensureAuthenticated, async (req, res) => {
  try {
    const { isbn13, title, author, genre, page_count, summary, date_published, book_cover } = req.body;
    if (!isbn13 || !title || !author || !genre || !page_count) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect('/auth/add-book');
    }

    const validationResult = await validateAndFetchBook(isbn13);
    const finalCoverUrl = validationResult.success
      ? validationResult.found_url
      : (book_cover || '/img/placeholder.jpg');

    if (validationResult.success) req.flash('success', 'Book found! Cover URL autofilled.');

    await db.query(
      `INSERT INTO books
         (isbn13, title, author, genre, page_count, summary, date_published, book_cover, average_rating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0)`,
      [isbn13, title, author, genre, page_count, summary, date_published || null, finalCoverUrl]
    );

    req.flash('success', 'Book added successfully!');
    return res.redirect('/books');
  } catch (error) {
    console.error('Error adding book:', error);
    req.flash('error', 'Server error: Unable to add book.');
    return res.redirect('/auth/add-book');
  }
});

// POST: Edit Book
router.post('/:book_id/edit-book', ensureAuthenticated, async (req, res) => {
  try {
    const { book_id } = req.params;
    const { title, author, genre, page_count, summary, date_published } = req.body;

    if (!title || !author || !genre || !page_count || !date_published) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect(`/auth/${book_id}/edit-book`);
    }

    await db.query(
      `UPDATE books
       SET title=$1, author=$2, genre=$3, page_count=$4, summary=$5, date_published=$6
       WHERE book_id=$7`,
      [title, author, genre, page_count, summary, date_published, book_id]
    );

    req.flash('success', 'Book modified successfully!');
    return res.redirect('/books');
  } catch (error) {
    console.error('Error modifying book:', error);
    req.flash('error', 'Server error: Unable to edit book.');
    return res.redirect(`/auth/${req.params.book_id}/edit-book`);
  }
});

// GET: ADD REVIEW
router.get('/:user_id/add-review', ensureAuthenticated, async (req, res) => {
  try {
    const { user_id } = req.params;
    // get books not reviewed by user
    const books = await queryBooks('SELECT * FROM books WHERE book_id NOT IN (SELECT book_id FROM reviews WHERE user_id = $1)', [user_id]);
    const user = await queryUsers('SELECT * FROM users WHERE user_id = $1', [user_id]);
    res.render('./admin/reviewForm', {
      title: 'Add Book',
      description: 'Add a new book to your collection.',
      books,
      user: user[0],
      layout: 'layouts/auth'
    });
  } catch (error) {
    console.error('Error rendering add review form:', error);
    req.flash('error', 'Server error: Unable to render add review form.');
    return res.redirect('/');
  }
});

// GET: ADD REVIEW FOR A SPECIFIC BOOK
router.get('/:user_id/add-review/:book_id', ensureAuthenticated, async (req, res) => {
  try {
    const { user_id, book_id } = req.params;
    if (!book_id || !user_id) {
      req.flash('error', 'User ID and Book ID are required to add a review.');
      return res.redirect('/');
    }

    const books = await queryBooks('SELECT * FROM books WHERE book_id NOT IN (SELECT book_id FROM reviews WHERE user_id = $1)', [user_id]);
    const user = await queryUsers('SELECT * FROM users WHERE user_id = $1', [user_id]);
    const book = await queryBooks('SELECT * FROM books WHERE book_id = $1', [book_id]);

    if (!book) {
      req.flash('error', 'Book not found.');
      return res.redirect('/');
    }
    res.render('./admin/reviewForm', {
      title: 'Add Review',
      description: 'Write a review for a book.',
      books,
      user: user[0],
      book: book[0],
      layout: 'layouts/auth'
    });
  } catch (error) {
    console.error('Error rendering add review form:', error);
    req.flash('error', 'Server error: Unable to render add review form.');
    return res.redirect('/');
  }
});


// GET: EDIT REVIEW 
router.get('/:user_id/edit-review/:review_id', ensureAuthenticated, async (req, res) => {
  try {
    const { user_id, review_id } = req.params;
    
    const books = await queryBooks('SELECT * FROM books WHERE book_id NOT IN (SELECT book_id FROM reviews WHERE user_id = $1)', [user_id]);

    const user = await queryUsers('SELECT * FROM users WHERE user_id = $1', [user_id]);
    const reviewResult = await queryReviews('SELECT *, title as book_title FROM reviews JOIN books on reviews.book_id = books.book_id WHERE review_id = $1', [review_id]);
    const review = reviewResult[0];
    const book_id = review.book_id;

    const book = await queryBooks('SELECT * FROM books WHERE book_id = $1', [book_id]);

    if (!user || !review) {
      req.flash('error', 'User or review not found.');
      return res.redirect('/');
    }

    res.render('./admin/reviewForm', {
      title: 'Edit Review',
      description: 'Edit your review for a book.',
      books,
      user: user[0],
      book: book[0],
      review,
      layout: 'layouts/auth'
    });
  } catch (error) {
    console.error('Error rendering edit review form:', error);
    req.flash('error', 'Server error: Unable to render edit review form.');
    return res.redirect('/');
  }
});

// POST: ADD REVIEW
router.post('/:user_id/add-review', ensureAuthenticated, async (req, res) => {
  try {
    const { user_id } = req.params;
    let { book_id, rating, short_description, long_description } = req.body;
    rating = parseInt(rating, 10);

    if (!book_id || !rating || !short_description) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect(`/auth/${user_id}/add-review`);
    }

    await db.query(
      `INSERT INTO reviews (user_id, book_id, rating, short_description, long_description)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, book_id, rating, short_description, long_description]
    );

    req.flash('success', 'Review added successfully!');
    return res.redirect(`/auth/user/${user_id}`);
  } catch (error) {
    console.error('Error adding review:', error);
    req.flash('error', 'Server error: Unable to add review.');
    return res.redirect(`/auth/${user_id}/add-review`);
  }
});

// POST: EDIT REVIEW 
router.post('/:user_id/edit-review/:review_id', ensureAuthenticated, async (req, res) => {
  try {
    const { user_id, review_id } = req.params;
    
    let { book_id, rating, short_description, long_description } = req.body;

    if (rating) {
      rating = parseInt(rating, 10);
    }

    if (!book_id || !short_description) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect(`/auth/${user_id}/edit-review/${review_id}`);
    }

    await db.query(
      `UPDATE reviews SET user_id = $1, book_id = $2, rating = $3, short_description = $4, long_description = $5 WHERE review_id = $6`,
      [user_id, book_id, rating, short_description, long_description, review_id]
    );

    req.flash('success', 'Review modified successfully!');
    return res.redirect(`/auth/user/${user_id}`);
  } catch (error) {
    console.error('Error modifying review:', error);
    req.flash('error', 'Server error: Unable to edit review.');
    return res.redirect(`/auth/${user_id}/edit-review`);
  }
});
// POST: DELETE REVIEW
router.post('/:user_id/delete-review/:review_id', ensureAuthenticated, async (req, res) => {
  try {
    const { user_id, review_id } = req.params;
    await db.query(
      `DELETE FROM reviews WHERE review_id = $1 AND user_id = $2`,
      [review_id, user_id]
    );

    req.flash('success', 'Review deleted successfully!');
    return res.redirect(`/auth/user/${user_id}`);
  } catch (error) {
      console.error('Error deleting review:', error);
      req.flash('error', 'Server error: Unable to delete review.');
      return res.redirect(`/auth/${user_id}/edit-review`);
  }
});

// ----------------------
// Export router
// ----------------------
export default router;
