import os
from dotenv import load_dotenv
import mysql.connector

load_dotenv()

DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_NAME = os.getenv('DB_NAME')


def init_db():
    try:
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME)
        cur = conn.cursor()

        cur.execute('''
        CREATE TABLE IF NOT EXISTS chatbot_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(100),
            message TEXT NOT NULL,
            predicted_intent VARCHAR(100),
            confidence FLOAT,
            correct_intent VARCHAR(100),
            is_trained BOOLEAN DEFAULT FALSE,
            branch VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        ''')

        cur.execute('''
        CREATE TABLE IF NOT EXISTS training_examples (
            id INT AUTO_INCREMENT PRIMARY KEY,
            text TEXT NOT NULL,
            intent VARCHAR(100) NOT NULL,
            source ENUM('manual', 'customer', 'imported') DEFAULT 'manual',
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')

        cur.execute('''
        CREATE TABLE IF NOT EXISTS model_versions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            version VARCHAR(20),
            accuracy FLOAT,
            training_samples INT,
            is_active BOOLEAN DEFAULT FALSE,
            trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')

        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print('DB init error:', e)
