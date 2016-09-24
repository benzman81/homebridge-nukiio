## 0.3.2

New features:

  - Use different request timeouts for lock state and lock action. (You might need to fix your configuration)

Bugfix:

  - Wrong logging for lock actions.

## 0.3.1

Bugfix:

  - Less logging.
  - Fix context, like always.

## 0.3.0

New features:

  - Again some major code re-work.

## 0.2.4

Bugfix:

  - Doors with door latches must never change to unlock state.

## 0.2.3

Bugfix:

  - Fix wrong function call for setting state.

## 0.2.2

Bugfix:

  - Fix context at other position.

## 0.2.1

Bugfix:

  - Fix context.

## 0.2.0

New features:

  - Support for doors with door latches. If you set "lock_action" and "unlock_action" both to "3" you get an accessory that shows always locked state and always does an unlatch.
  - You can now set the directory for the local cache.
  - Major re-work on request handling.

Others:

  - Changed default value of "request_timeout" to 60000 ms.
  - Clean code.

## 0.1.4

Bugfix:

  - Fix variable, again.

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