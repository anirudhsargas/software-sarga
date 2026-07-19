"""Shared database utilities for ml-service modules."""

import os

import mysql.connector


def get_config():
    return {
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": int(os.environ.get("DB_PORT", 3306)),
        "user": os.environ.get("DB_USER", "root"),
        "password": os.environ.get("DB_PASSWORD", ""),
        "database": os.environ.get("DB_NAME", "sarga_db"),
    }


def get_connection():
    return mysql.connector.connect(**get_config())


def dict_cursor(conn):
    return conn.cursor(dictionary=True)  # NOSONAR
