import uuid
from sqlalchemy import Column, String, DateTime, func, Uuid
from sqlalchemy.orm import relationship
from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="student")  # student | evaluator | admin
    created_at = Column(DateTime(timezone=True), default=func.now)

    submissions = relationship("Submission", back_populates="user", cascade="all, delete-orphan")
