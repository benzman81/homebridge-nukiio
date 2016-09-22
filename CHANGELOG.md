## 0.1.3

New features:

  - If a getState request is running for one lock and getState is requested again for this lock, no additional request will be made, it will use the cache set by the running request when this one ends.
  
## 0.1.2

Bugfix:

  - Set state to home kit even if a timeout was reached setting state as we can assume that everything went well and nuki is just too slow.
  
## 0.1.1

Bugfix:

  - Fix variable.

## 0.1.0

New features:

  - If timeout is reached use the last known state from cache.

Bugfix:

  - Use timeout on requests to bridge.

## 0.0.5

Bugfix:

  - Fixed socket hang up.

## 0.0.4

New features:

  - Added configuration for lock action and unlock action (i.e. if you want to unlatch instead of just unlock).

## 0.0.3

Initial release version.