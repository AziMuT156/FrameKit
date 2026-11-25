FrameKit для iPhone — 2 способи встановити
==========================================

СПОСІБ 1 (НАЙКРАЩИЙ — БЕЗ .ipa, БЕЗ ЗЛЬОТУ КОЖНІ 7 ДНІВ, ЗА 30 СЕКУНД):
1. Перетягни папку D:\ysw\framekit_pwa на https://app.netlify.com/drop (або залий на GitHub Pages).
2. Отримай посилання виду https://....netlify.app і скинь другу на iPhone.
3. Друг відкриває посилання в Safari -> тисне "Поділитися" (стрілка вгору) -> "На екран «Додому»" (Add to Home Screen).
4. FrameKit з'явиться на робочому столі iPhone з піксельною іконкою, відкриватиметься на ВЕСЬ екран без панелі Safari, працюватиме 100% ОФЛАЙН (з 16-біт RAW!) і НІКОЛИ не злетить!

СПОСІБ 2 (СПРАВЖНІЙ .ipa ФАЙЛ ЧЕРЕЗ БЕЗКОШТОВНИЙ ХМАРНИЙ MAC ВІД GITHUB):
На Windows скомпілювати бінарник iOS (.ipa) неможливо (потрібен macOS + Xcode), але тут вже все готово для автоматичної збірки на сервері GitHub:
1. Створи безкоштовний репозиторій на GitHub і залий туди папки framekit_pwa/ та framekit_ios/.
2. Поклади файл framekit_ios/github_workflow_build_ipa.yml у .github/workflows/build-ios-ipa.yml.
3. У вкладці Actions на GitHub через ~2 хвилини з'явиться готовий артефакт FrameKit_v1.5.ipa.
4. Друг ставить його на iPhone через AltStore, SideStore, Sideloadly або TrollStore.
