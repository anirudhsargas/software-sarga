import os
import json
from sentence_transformers import SentenceTransformer
import numpy as np
import pickle5 as pickle


MODEL_PATH = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')), 'models', 'intent_model.pkl')


def _load_model():
    if not os.path.exists(MODEL_PATH):
        return None
    with open(MODEL_PATH, 'rb') as f:
        return pickle.load(f)


def predict_intent(text: str) -> dict:
    model = _load_model()
    if model is None:
        return {'error': 'Model not found. Train the model first.'}

    encoder = SentenceTransformer('l3cube-pune/malayalam-sentence-bert')
    clf = model['classifier']
    le = model['label_encoder']

    emb = encoder.encode([text])
    if hasattr(clf, 'predict_proba'):
        probs = clf.predict_proba(emb)[0]
        best_idx = int(np.argmax(probs))
        confidence = float(probs[best_idx]) * 100.0
        intent = le.inverse_transform([best_idx])[0]
        all_scores = {le.inverse_transform([i])[0]: float(p) * 100.0 for i, p in enumerate(probs)}
    else:
        pred = clf.predict(emb)[0]
        intent = le.inverse_transform([pred])[0]
        confidence = 100.0
        all_scores = {intent: confidence}

    if confidence < 50.0:
        intent = 'other'

    return {'intent': intent, 'confidence': round(confidence, 2), 'all_scores': all_scores}


if __name__ == '__main__':
    print(predict_intent('എന്റെ ഓർഡർ റെഡി ആണോ?'))
