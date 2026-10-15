#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  printf '%s\n' 'Usage: wapala-service {start|stop|restart|status}' >&2
  exit 64
fi
case "$1" in
  start|stop|restart|status) ;;
  *) printf '%s\n' 'Action not allowed.' >&2; exit 64 ;;
esac
exec /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/systemctl --no-pager "$1" wapala.service
