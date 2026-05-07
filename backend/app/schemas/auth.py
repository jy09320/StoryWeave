from pydantic import BaseModel, EmailStr

from app.schemas.common import ORMResponseModel


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORMResponseModel):
    id: str
    email: str
    is_active: bool
