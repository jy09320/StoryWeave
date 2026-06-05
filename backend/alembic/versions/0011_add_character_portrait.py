from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("characters", sa.Column("portrait_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("characters", "portrait_url")
