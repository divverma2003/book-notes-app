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
  "Adventure","Poetry","Programming", "Science Fiction","Memoir","Travel", "Technology",
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
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  req.flash('error', 'You must be logged in to view this page.');
  res.redirect('/login');
}

// ----------------------
// Helper Functions
// ----------------------
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
};

const queryReviews = async (query, params = null) => {
  try {
    const reviews = await db.query(query, params);
    return reviews.rows;
  } catch (error) {
    console.error('Error querying reviews:', error);
    throw error;
  }
};

// ----------------------
// API Calls
// ----------------------
const API_BOOK_COVERS_ENDPOINT = 'https://covers.openlibrary.org/b/isbn';
const API_BOOKS_ENDPOINT = 'https://openlibrary.org/isbn/';

const bookExists = async (isbn13) => {
  try {
    const response = await axios.get(`${API_BOOKS_ENDPOINT}${isbn13}.json`);
    return response.status === 200;
  } catch (error) {
    console.error('Error checking if book exists:', error);
    return false;
  }
};

const validateAndFetchBook = async (isbn) => {
  try {
    isbn = isbn.replace(/-/g, '');
    const exists = await bookExists(isbn);
    if (!exists) {
      return { success: false, message: 'Book not found! Try another ISBN.' };
    }
    const found_url = `${API_BOOK_COVERS_ENDPOINT}/${isbn}-L.jpg`;
    return { success: true, found_url, isbn };
  } catch (error) {
    console.error('Error validating ISBN:', error);
    return { success: false, message: 'An error occurred while validating the ISBN.' };
  }
};

// ----------------------
// Routes
// ----------------------

// GET: User Dashboard
router.get('/user/:user_id', ensureAuthenticated, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const query = `
      SELECT name, user_id, email, about, phone_number, title AS favorite_book_title 
      FROM users 
      LEFT JOIN books ON users.favorite_book_id = books.book_id 
      AND users.user_id = $1`;
    const userProfile = await queryUsers(query, [user_id]);
    const user = userProfile[0];

    const reviewQuery = `
      SELECT *, title AS book_title 
      FROM reviews 
      JOIN books ON reviews.book_id = books.book_id 
      WHERE user_id = $1`;
    const userReviews = await queryReviews(reviewQuery, [user_id]);

    res.render('./admin/userDashboard', {
      title: 'User Dashboard',
      description: 'Manage your book notes and reviews.',
      userProfile: user,
      reviews: userReviews,
      layout: 'layouts/auth'
    });
  } catch (error) {
    console.error('Error rendering user dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
});

// GET: Edit User --> /auth/user/:user_id/edit
router.get('/user/:user_id/edit', ensureAuthenticated, async (req, res) => {
    try {
        const result = await queryBooks("SELECT * FROM books");
        res.render('userForm', {
            title: 'Edit User',
            description: 'Update your account information.',
            books: result,
        });
    } catch (error) {
        console.error('Error rendering sign up page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// GET: Edit Book Form
router.get('/:book_id/edit-book', ensureAuthenticated, async (req, res) => {
  try {
    const book_id = req.params.book_id;
    const result = await queryBooks('SELECT * FROM books WHERE book_id = $1', [book_id]);
    const book = result[0];

    book.date_published = book.date_published ? new Date(book.date_published).toISOString().split('T')[0] : '';

    const { isbn13, title, author, genre, page_count, summary, date_published, book_cover } = book;
    console.log('Book details:', book);
    
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
router.get('/add-book', ensureAuthenticated, async (req, res) => {
  try {
    res.render('./admin/bookForm', {
      title: 'Add Book',
      description: 'Add a new book to your collection.',
      book: null,
      genres,
      layout: 'layouts/auth'
    });
  } catch (error) {
    console.error('Error rendering add book page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// GET: Add Review Form (Fix Up Later)
router.get('/:user_id/add-review', ensureAuthenticated, async (req, res) => {
  try {
    const books = await queryBooks('SELECT * FROM books ORDER BY title');
    res.render('./admin/reviewForm', {
      title: 'Add Review',
      description: 'Write a review for a book.',
      books,
      layout: 'layouts/auth'
    });
  } catch (error) {
    console.error('Error rendering add review page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// TODOS:
// GET: ADD REVIEW
// GET: EDIT REVIEW

// POST: ADD REVIEW
// POST: EDIT REVIEW
// POST: DELETE REVIEW

// POST: EDIT User
router.post('/user/:user_id/edit', ensureAuthenticated, async (req, res) => {
  try {
    const user_id = req.params.user_id;
    const { name, password, about, phone_number, favorite_book_id, user_color } = req.body;


    // Basic validation
    if (!name) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect(`/auth/user/${user_id}/edit`);
    }

    let updatePassword = password ? true : false;

    if (!updatePassword) {
      // Update user in database
      const updateQuery = `
        UPDATE users
        SET
          name = $1,
          email = $2,
          about = $3,
          phone_number = $4,
          favorite_book_id = $5,
          user_color = $6
        WHERE user_id = $7
      `;
      await db.query(updateQuery, [
        name,
        email,
        about,
        phone_number,
        favorite_book_id,
        user_color,
        user_id
      ]);

      req.flash('success', 'User updated successfully!');
      return res.redirect(`/auth/user/${user_id}`);
    } else {
        const hash = await bcrypt.hash(password, saltRounds);
        const updateQuery = `
          UPDATE users
          SET
            name = $1,
            email = $2,
            about = $3,
            phone_number = $4,
            favorite_book_id = $5,
            user_color = $6,
            password = $7
          WHERE user_id = $8
        `;
        await db.query(updateQuery, [
          name,
          email,
          about,
          phone_number,
          favorite_book_id,
          user_color,
          hash,
          user_id
        ]);
    }

  } catch (error) {
    console.error('Error updating user:', error);
    req.flash('error', 'Server error: Unable to update user.');
    return res.redirect(`/auth/user/${user_id}/edit`);
  }
});

// POST: DELETE USER

// POST: Validate ISBN
router.post('/validate-isbn', ensureAuthenticated, async (req, res) => {
  try {
    const { isbn13 } = req.body;

    if (!isbn13) {
      return res.json({ success: false, message: 'ISBN is required.' });
    }

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


// POST: Add Book -> /auth/add-book
router.post('/add-book', ensureAuthenticated, async (req, res) => {
  try {
    const {
      isbn13,
      title,
      author,
      genre,
      page_count,
      summary,
      date_published,
      book_cover,
    } = req.body;

    // Basic validation
    if (!isbn13 || !title || !author || !genre || !page_count) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect('/auth/add-book');
    }

    // Optional: Validate ISBN via Open Library API
    const validationResult = await validateAndFetchBook(isbn13);

    let finalCoverUrl = book_cover || '/img/placeholder.jpg';
    if (validationResult.success) {
      finalCoverUrl = validationResult.found_url;
      req.flash('success', 'Book found! Cover URL autofilled.');
    }

    // Insert book into database
    const insertQuery = `
      INSERT INTO books
        (isbn13, title, author, genre, page_count, summary, date_published, book_cover, average_rating)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0)
      RETURNING *;
    `;
    const insertedBooks = await db.query(insertQuery, [
      isbn13,
      title,
      author,
      genre,
      page_count,
      summary,
      date_published || null,
      finalCoverUrl,
    ]);

    req.flash('success', 'Book added successfully!');
    return res.redirect('/books');

  } catch (error) {
    console.error('Error adding book:', error);
    req.flash('error', 'Server error: Unable to add book.');
    return res.redirect('/auth/add-book');
  }
});


// POST: Edit book -> /auth/:book_id/edit-book
router.post('/:book_id/edit-book', ensureAuthenticated, async (req, res) => {
  try {
    const book_id = req.params.book_id;
    console.log('Editing book with ID:', book_id);
    const {
      title,
      author,
      genre,
      page_count,
      summary,
      date_published,
    } = req.body;

    // Basic validation
    if (!title || !author || !genre || !page_count || !date_published) {
      req.flash('error', 'Please fill in all required fields.');
      return res.redirect(`/auth/${book_id}/edit-book`);
    }

    // Update book in database
    const updateQuery = `
      UPDATE books
      SET
        title = $1,
        author = $2,
        genre = $3,
        page_count = $4,
        summary = $5,
        date_published = $6
      WHERE book_id = $7
      RETURNING *;
    `;
    const updatedBook = await db.query(updateQuery, [
      title,
      author,
      genre,
      page_count,
      summary,
      date_published,
      book_id
    ]);

    req.flash('success', 'Book modified successfully!');
    return res.redirect('/books');

  } catch (error) {
    console.error('Error modifying book:', error);
    req.flash('error', 'Server error: Unable to edit book.');
    return res.redirect(`/auth/${book_id}/edit-book`);
  }
});

// ----------------------
// Export router
// ----------------------
export default router;
