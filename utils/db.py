from flask_pymongo import PyMongo

def get_db(app):
    mongo = PyMongo(app)
    return mongo