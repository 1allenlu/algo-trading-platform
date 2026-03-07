"""
Unit tests for auth_service — no DB or network required.
Tests the bcrypt hash/verify cycle and token logic independently.
"""

import pytest
from app.services.auth_service import hash_password, verify_password, auth_enabled


def test_hash_produces_bcrypt_string():
    h = hash_password("testpass")
    assert h.startswith("$2b$")

def test_verify_correct_password():
    h = hash_password("correcthorse")
    assert verify_password("correcthorse", h) is True

def test_verify_wrong_password():
    h = hash_password("correcthorse")
    assert verify_password("wrong", h) is False

def test_verify_empty_password():
    h = hash_password("")
    assert verify_password("", h) is True
    assert verify_password("notempty", h) is False

def test_verify_bad_hash_returns_false():
    assert verify_password("anything", "notahash") is False

def test_auth_disabled_when_no_secret(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "JWT_SECRET_KEY", "")
    assert auth_enabled() is False

def test_auth_enabled_when_secret_set(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "JWT_SECRET_KEY", "somesecret")
    assert auth_enabled() is True
