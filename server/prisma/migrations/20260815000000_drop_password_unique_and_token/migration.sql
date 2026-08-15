-- Security remediation.
--
-- 1. Drop the unique index on User.password. A unique constraint on a
--    credential column is a password-existence oracle under any deterministic
--    hashing scheme, and provides no benefit under a salted one.
--
-- 2. Drop User.token. JWTs are stateless and were being persisted on signup,
--    which turned the users table into a store of live bearer credentials.

-- DropIndex
DROP INDEX `User.password_unique` ON `User`;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `token`;
