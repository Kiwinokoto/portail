from .accounts import AccountsMixin
from .catalog import CatalogMixin
from .db import BaseStore
from .learning import LearningMixin
from .sessions import SessionsMixin


class PortalStore(AccountsMixin, CatalogMixin, LearningMixin, SessionsMixin, BaseStore):
    pass
