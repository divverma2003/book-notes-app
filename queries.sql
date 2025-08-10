CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, -- hashed with bcrypt
    name TEXT NOT NULL,
    about TEXT,
    phone_number TEXT,
    favorite_book_id INTEGER,
    user_color TEXT,
    CONSTRAINT fk_users_favorite_book
        FOREIGN KEY (favorite_book_id)
        REFERENCES books(book_id)
        ON DELETE SET NULL,
    CONSTRAINT phone_number_format CHECK (
        phone_number IS NULL OR
        phone_number ~ '^\+?[\d\s\-\(\)]{7,15}$'
    )
);

CREATE TABLE books (
    book_id SERIAL PRIMARY KEY,
    isbn13 CHAR(13) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre TEXT,
    page_count INTEGER CHECK (page_count >= 1),
    summary TEXT,
    date_published DATE,
    book_cover TEXT DEFAULT '/img/placeholder.jpg', -- fallback cover URL
    average_rating NUMERIC(3, 2) DEFAULT 0,
);

CREATE TABLE reviews (
    review_id SERIAL PRIMARY KEY,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
    short_description TEXT NOT NULL,
    long_description TEXT,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
    CONSTRAINT unique_user_book_review UNIQUE (user_id, book_id) -- prevent duplicate reviews
);


CREATE OR REPLACE FUNCTION update_average_rating()
RETURNS TRIGGER AS $$
DECLARE
    target_book_id INTEGER;
BEGIN
    -- Figure out which book_id to update
    IF (TG_OP = 'DELETE') THEN
        target_book_id := OLD.book_id;
    ELSE
        target_book_id := NEW.book_id;
    END IF;

    -- Update the average rating
    UPDATE books
    SET average_rating = COALESCE((
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM reviews
        WHERE book_id = target_book_id
    ), 0)
    WHERE book_id = target_book_id;

    -- Return appropriate row
    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- Trigger to update average rating after insert, update, or delete on reviews
CREATE TRIGGER trg_update_avg_after_insert
AFTER INSERT OR UPDATE OF rating OR DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_average_rating();

INSERT INTO books (isbn13, title, author, genre, page_count, summary, date_published, book_cover) VALUES
('9780134190440', 'Effective Java', 'Joshua Bloch', 'Programming', 416, 'Best practices for Java programming.', '2018-01-11', 'https://covers.openlibrary.org/b/isbn/9780134190440.jpg'),
('9781491950357', 'Designing Data-Intensive Applications', 'Martin Kleppmann', 'Technology', 616, 'Architectural patterns for reliable software systems.', '2017-03-16', 'https://covers.openlibrary.org/b/isbn/9781491950357.jpg'),
('9780131103627', 'The C Programming Language', 'Brian W. Kernighan and Dennis M. Ritchie', 'Programming', 274, 'Classic book on C programming language.', '1988-04-01', 'https://covers.openlibrary.org/b/isbn/9780131103627.jpg'),
('9780596009205', 'Head First Design Patterns', 'Eric Freeman et al.', 'Programming', 694, 'A brain-friendly guide to design patterns.', '2004-10-25', 'https://covers.openlibrary.org/b/isbn/9780596009205.jpg'),
('9780262033848', 'Introduction to Algorithms', 'Thomas H. Cormen et al.', 'Computer Science', 1312, 'Comprehensive textbook on algorithms.', '2009-07-31', 'https://covers.openlibrary.org/b/isbn/9780262033848.jpg'),
('9780132350884', 'Clean Code', 'Robert C. Martin', 'Programming', 464, 'A handbook of agile software craftsmanship.', '2008-08-11', 'https://covers.openlibrary.org/b/isbn/9780132350884.jpg'),
('9780201633610', 'Design Patterns', 'Erich Gamma et al.', 'Programming', 395, 'Elements of reusable object-oriented software.', '1994-10-31', 'https://covers.openlibrary.org/b/isbn/9780201633610.jpg'),
('9780134685991', 'Effective Modern C++', 'Scott Meyers', 'Programming', 334, '42 specific ways to improve your use of C++11 and C++14.', '2014-11-05', 'https://covers.openlibrary.org/b/isbn/9780134685991.jpg'),
('9780134494166', 'Refactoring', 'Martin Fowler', 'Programming', 448, 'Improving the design of existing code.', '2018-11-19', 'https://covers.openlibrary.org/b/isbn/9780134494166.jpg'),
('9781492078005', 'Fluent Python', 'Luciano Ramalho', 'Programming', 792, 'Clear, concise, and effective programming in Python.', '2015-07-30', 'https://covers.openlibrary.org/b/isbn/9781492078005.jpg');

-- Create 2 user accounts for testing (all fields)
INSERT INTO users (email, password, name, about, phone_number, favorite_book_id, user_color) VALUES
('testuser1@example.com', 'password', 'Test User 1', 'About Test User 1', '+1234567890', 1, 'blue'),
('testuser2@example.com', 'password', 'Test User 2', 'About Test User 2', '+0987654321', 2, 'green');

-- Create 2 reviews for testing (all fields)
INSERT INTO reviews (rating, short_description, long_description, user_id, book_id) VALUES
(8, 'Great book on Java!', 'Effective Java provides best practices for Java programming.', 1, 1),
(9, 'A must-read for software architects.', 'Designing Data-Intensive Applications is essential for understanding modern software architecture.', 1, 2);