from .accounts import AccountsMixin
from .catalog import CatalogMixin
from .db import BaseStore
from .sessions import SessionsMixin


class PortalStore(AccountsMixin, CatalogMixin, SessionsMixin, BaseStore):
    pass
