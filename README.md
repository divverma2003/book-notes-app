# Book Notes Tracker Capstone Project
---

## Features

### User Authentication
- Register, log in, and edit account details using Express sessions.

### Book Management
- Add books to the database with ISBN validation via RESTful API calls.
- Fetch book covers using the Open Library Covers RESTful API.

### Reviews Management
- Add reviews for books.
- Edit and delete reviews.

### Data Persistence
- Store all books, reviews, and user data in a PostgreSQL database.

### Frontend
- Clean user interface built with HTML, CSS, JS, and EJS templates.

### Error Handling
- Graceful handling of application errors and API request errors.

---

## Installation & Setup

1. **Clone the repository**
2. **Install dependencies:** 
    a. Run: npm install
3. **Set up PostgreSQL database:** 
    a. Create a new database in PostgreSQL.
    b. Configure your .env file with your database connection:
        DB_HOST=localhost
        DB_USER=your_user
        DB_PASSWORD=your_password
        DB_NAME=your_database
        SESSION_SECRET=your_secret_key
4. **Start Server:**
    a. Run: nodemon index.js
