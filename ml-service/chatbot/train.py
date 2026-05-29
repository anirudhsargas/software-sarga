import os
import json
from datetime import datetime
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import LogisticRegression
import pickle5 as pickle


def train_and_save():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    data_path = os.path.join(base_dir, 'data', 'training_data.json')
    models_dir = os.path.join(base_dir, 'models')
    os.makedirs(models_dir, exist_ok=True)

    with open(data_path, 'r', encoding='utf-8') as f:
        dataset = json.load(f)

    texts = []
    labels = []
    intent_counts = {}
    for item in dataset:
        intent = item['intent']
        utts = item.get('utterances', [])
        intent_counts[intent] = len(utts)
        for u in utts:
            texts.append(u)
            labels.append(intent)

    N = len(texts)

    print('Loading sentence transformer...')
    encoder = SentenceTransformer('l3cube-pune/malayalam-sentence-bert')
    X = encoder.encode(texts, show_progress_bar=True)

    le = LabelEncoder()
    y = le.fit_transform(labels)

    clf = LogisticRegression(max_iter=1000, C=5)
    clf.fit(X, y)

    acc = clf.score(X, y)

    model_payload = {
        'classifier': clf,
        'label_encoder': le,
        'version': '1.0',
        'sample_count': N
    }

    model_file = os.path.join(models_dir, 'intent_model.pkl')
    with open(model_file, 'wb') as f:
        pickle.dump(model_payload, f)

    meta = {
        'version': '1.0',
        'accuracy': float(acc),
        'trained_at': datetime.utcnow().isoformat() + 'Z',
        'sample_count': N
    }
    meta_file = os.path.join(models_dir, 'model_meta.json')
    with open(meta_file, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print('Training summary:')
    for intent, cnt in intent_counts.items():
        print(f' - {intent}: {cnt} samples')
    print(f'Total samples: {N}')
    print(f'Training accuracy (train set): {acc:.4f}')


if __name__ == '__main__':
    train_and_save()
