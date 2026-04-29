# StoryWeave

AI Fanfiction Writing Platform — An Immersive Creative Workspace

## 📖 Project Overview

StoryWeave is an AI-assisted writing platform designed specifically for fanfiction creators, dedicated to delivering an immersive and seamless creative experience. The platform deeply integrates AI capabilities into the writing workflow, enabling creators to focus on storytelling while leveraging AI for续写, rewriting, and inspiration generation.

## ✨ Core Features

### 🖥️ Workspace Architecture
- **Global Workspace**: Primary global navigation + secondary project outline + right-side auxiliary drawer
- **Dashboard**: Recent progress board + high-density project list + quick creation entry
- **Project Workspace**: Chapter manager + character binding + creative dynamic graph

### ✍️ Intelligent Editor
- **Tiptap Editor Base**: Modern rich-text editing experience
- **In-editor Intelligent Interactions**:
  - Bubble Menu for quick actions
  - Slash Command panel
  - Mention characters
  - Character hover cards
- **Immersive Text Container**: Focus-optimized writing area

### 🤖 AI Capabilities
- **AI Rewriting & Diff Loop**: Select text → Rewriting → Diff comparison → Accept/Reject
- **AI Toolbox**: Input and output side-by-side layout + task type hierarchy + generation history
- **Context Injection**: Project settings, character information, and worldbuilding联动

### 📚 Asset Management
- **Character Library**: Structured character cards + master/slave views
- **Worldbuilding**: Project-level setting management
- **Chapter Management**: Version history + sorting + status tracking

## 🛠️ Technology Stack

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- shadcn/ui component library
- Tiptap editor
- React Router (routing)

### Backend
- Python 3.12 + FastAPI
- SQLAlchemy (ORM)
- Alembic (database migrations)
- OpenAI/Anthropic API integration

### Infrastructure
- Docker + Docker Compose
- PostgreSQL database
- Nginx (production reverse proxy)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.12+
- Docker (optional)

### Local Development

#### Option 1: One-click Docker Start

```bash
# Copy environment variables configuration
cp .env.docker.example .env.docker

# Start all services
docker-compose up -d
```

#### Option 2: Manual Start

**Start Backend**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\Activate.ps1  # Windows

# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn app.main:app --reload
```

**Start Frontend**
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables Configuration

Backend `.env` configuration:
```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/storyweave
AI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
```

Frontend Vite environment variables:
```env
VITE_API_BASE_URL=http://localhost:8000
```

## 📁 Project Structure

```
story-weave/
├── backend/                 # Python FastAPI backend
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── core/          # Core configuration
│   │   ├── models/        # Data models
│   │   ├── schemas/       # Pydantic schemas
│   │   └── services/     # Business services
│   ├── alembic/           # Database migrations
│   └── requirements.txt
│
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/   # Components
│   │   ├── pages/        # Pages
│   │   ├── services/     # API services
│   │   ├── lib/          # Utility libraries
│   │   └── types/        # TypeScript types
│   ├── public/           # Static assets
│   └── package.json
│
├── docker-compose.yml    # Docker composition
├── DOCKER.md             # Docker documentation
└── PLAN.md               # Project roadmap
```

## 🔄 Development Guidelines

### Git Commit Guidelines
Use Chinese commit messages in format: `type: description`

Valid types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation update
- `style`: Code formatting
- `test`: Test-related changes
- `chore`: Build/tooling changes

### Code Style Guidelines
- Frontend: ESLint + TypeScript strict mode
- Backend: Python type hints + Pydantic validation

## 📋 Current Progress

As per req-022 implementation plan, the following have been completed:

- ✅ Workspace shell structure finalized
- ✅ Editor base migrated to Tiptap
- ✅ In-editor AI loop functional
- ✅ AI Toolbox integrated into workspace

Pending items:
- Responsive design and main workflow validation
- Runtime blocking issues
- Final documentation polishing

See details at [](./.agent/requirements/req-022/implementation_plan.md)

## 🤝 Contribution Guidelines

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/xxx`)
3. Commit your changes (`git commit -m 'feat: xxx'`)
4. Push to the branch (`git push origin feature/xxx`)
5. Create a Pull Request

## 📄 License

MIT License

---

*Make creation freer, make stories more brilliant*