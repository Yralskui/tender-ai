import Link from "next/link";
import LandingPricing from "@/components/LandingPricing";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  FileSearch,
  Zap,
  Shield,
  TrendingUp,
  Bell,
  ArrowRight,
  Star,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen app-shell">
      {/* Навигация */}
      <nav className="border-b border-slate-200 sticky top-0 z-50 app-nav-glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center btn-primary">
              <Zap size={16} className="text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">TenderAI</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#how" className="hover:text-slate-900 transition-colors">Как работает</a>
            <a href="#compare" className="hover:text-slate-900 transition-colors">Отличия</a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">Тарифы</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-slate-600 hover:text-slate-900 transition-colors px-4 py-2">
              Войти
            </Link>
            <Link href="/auth/register" className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-all hover:opacity-90 btn-primary">
              Начать бесплатно
            </Link>
          </div>
        </div>
      </nav>

      {/* Герой */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-8 border border-emerald-200 bg-emerald-50 text-emerald-700">
          <Star size={14} />
          <span>TenderAI для поставщиков медизделий — анализ по РУ и ТЗ тендера</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Знай какие{" "}
          <span className="gradient-text">медтендеры</span>
          {" "}выиграешь до подачи заявки
        </h1>
        <p className="text-xl text-slate-600 max-w-3xl mx-auto mb-10 leading-relaxed">
          Загрузите РУ Росздравнадзора с приложением. AI извлечёт каталог изделий и сверит каждую позицию
          с техническим заданием тендера — комплекты белья, расходники, оборудование. Без отклонённых заявок из‑за несовпадения номенклатуры.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/auth/register" className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-medium text-white transition-all hover:opacity-90 text-lg btn-primary">
            Попробовать бесплатно
            <ArrowRight size={20} />
          </Link>
          <a href="#how" className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-medium border border-slate-200 text-slate-700 hover:border-slate-300 transition-all text-lg">
            Как это работает
          </a>
        </div>
        <p className="text-sm text-slate-500 mt-4">Бесплатно 7 дней · Без карты · Отмена в любой момент</p>

        {/* Демо-блок */}
        <div className="mt-16 max-w-4xl mx-auto rounded-2xl border border-slate-200 overflow-hidden app-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200" >
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-xs text-slate-500 ml-2">TenderAI — Анализ тендера</span>
          </div>
          <div className="p-6 text-left">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Тендер #0373200014526000088</p>
                <h3 className="text-slate-900 font-semibold">Поставка стерильных комплектов белья для операционных</h3>
                <p className="text-sm text-slate-600 mt-1">ГБУЗ г. Москвы · 2 850 000 ₽</p>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold score-green">
                  <CheckCircle size={14} />
                  91%
                </div>
                <p className="text-xs text-slate-500 mt-1">совпадение</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg alert-success">
                <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                <span className="text-sm text-slate-700">РУ №РЗН 2025-25693 — 47 позиций в каталоге, действует до 2030</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg alert-success">
                <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                <span className="text-sm text-slate-700">ТЗ: «комплект белья стерильный» — совпадение с позицией 12 в приложении к РУ</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg alert-warning">
                <AlertCircle size={16} className="text-amber-700 shrink-0" />
                <span className="text-sm text-slate-700">ТЗ требует ГОСТ Р ИСО 11607-1 — <span className="text-amber-700">проверьте упаковку в РУ</span></span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg alert-error">
                <XCircle size={16} className="text-red-600 shrink-0" />
                <span className="text-sm text-slate-700">ТЗ: катетер Foley — <span className="text-red-600">нет в вашем каталоге РУ</span></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Как работает */}
      <section id="how" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">Три шага для поставщика медизделий</h2>
          <p className="text-slate-600 text-lg">РУ с приложением → AI-анализ → точный список медтендеров</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              icon: <FileSearch size={22} />,
              title: "Загрузите РУ с приложением",
              desc: "AI извлекает полный каталог изделий из регистрационного удостоверения — не один товар, а весь перечень.",
              accent: "#2563eb",
            },
            {
              step: "02",
              icon: <Zap size={22} />,
              title: "Сверка с ТЗ тендеров",
              desc: "Система читает характеристики из извещений на zakupki.gov.ru и сопоставляет с вашим каталогом из РУ.",
              accent: "#059669",
            },
            {
              step: "03",
              icon: <TrendingUp size={22} />,
              title: "Точный ответ по каждому тендеру",
              desc: "Не «примерно подходите», а «эта позиция из ТЗ есть в вашем РУ, эта — нет» с процентом совпадения.",
              accent: "#7c3aed",
            },
          ].map((item) => (
            <div key={item.step} className="rounded-2xl p-8 border border-slate-200 card-hover app-card">
              <div className="flex items-center gap-3 mb-6">
                <span
                  className="text-sm font-semibold tabular-nums tracking-wide"
                  style={{ color: item.accent }}
                >
                  {item.step}
                </span>
                <div className="h-px flex-1" style={{ background: `${item.accent}33` }} />
              </div>
              <div
                className="w-11 h-11 rounded-lg border flex items-center justify-center mb-5"
                style={{
                  background: `${item.accent}0d`,
                  borderColor: `${item.accent}22`,
                  color: item.accent,
                }}
              >
                {item.icon}
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">{item.title}</h3>
              <p className="text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Сравнение с Контуром */}
      <section id="compare" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">TenderAI vs Контур.Закупки</h2>
          <p className="text-slate-600 text-lg">Контур ищет тендеры. Мы сверяем ваш РУ с ТЗ каждого медтендера.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 overflow-hidden app-card">
          <div className="grid grid-cols-3 text-sm font-medium border-b border-slate-200">
            <div className="p-5 text-slate-600">Возможность</div>
            <div className="p-5 text-center text-white border-l border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700">Контур.Закупки</div>
            <div className="p-5 text-center font-bold border-l border-slate-200" style={{ color: "#34d399" }}>TenderAI</div>
          </div>
          {[
            ["Поиск тендеров по ключевым словам", true, true],
            ["Уведомления о новых тендерах", true, true],
            ["Аналитика заказчиков и конкурентов", true, true],
            ["Знает каталог изделий из вашего РУ", false, true],
            ["Сверяет позиции ТЗ с приложением к удостоверению", false, true],
            ["Показывает точно что мешает подать заявку", false, true],
            ["Карта роста: какие документы получить", false, true],
            ["Предупреждает об истекающих лицензиях", false, true],
          ].map(([feature, kontur, us], i) => (
            <div key={i} className="grid grid-cols-3 text-sm border-b border-slate-200 last:border-0">
              <div className="p-5 text-slate-700">{feature as string}</div>
              <div className="p-5 flex justify-center items-center border-l border-slate-200">
                {kontur ? <CheckCircle size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600 opacity-50" />}
              </div>
              <div className="p-5 flex justify-center items-center border-l border-slate-200">
                {us ? <CheckCircle size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600 opacity-50" />}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Фичи */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-2 gap-8">
          {[
            {
              icon: <Shield size={24} />,
              title: "Никаких отклонённых заявок",
              desc: "AI проверяет каждый пункт требований тендера по вашим реальным документам. Знаете о несоответствии до подачи — не после.",
              color: "#3b82f6",
            },
            {
              icon: <Bell size={24} />,
              title: "Уведомления в Telegram",
              desc: "Новый подходящий тендер — сразу в телефон. Лицензия истекает через 30 дней — предупреждаем заранее. Дедлайн завтра — напоминаем.",
              color: "#10b981",
            },
            {
              icon: <TrendingUp size={24} />,
              title: "Карта роста компании",
              desc: "«Получи лицензию МЧС — откроешь 127 тендеров на 890 млн рублей». Стратегия развития основана на реальных данных рынка.",
              color: "#8b5cf6",
            },
            {
              icon: <FileSearch size={24} />,
              title: "Каталог из РУ, не сертификат на 1 товар",
              desc: "Для медтендеров важен полный перечень из приложения к РУ. AI читает его и матчит с каждой позицией ТЗ.",
              color: "#f59e0b",
            },
          ].map((item, i) => (
            <div key={i} className="rounded-2xl p-8 border border-slate-200 card-hover flex gap-6 app-card">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${item.color}20`, color: item.color }}>
                {item.icon}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Тарифы */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">Простые тарифы</h2>
          <p className="text-slate-600 text-lg">
            От 990 ₽/мес · год со скидкой 5% · промокоды от поддержки
          </p>
        </div>
        <LandingPricing />
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="rounded-3xl p-16 text-center app-card border border-blue-100 bg-gradient-to-br from-blue-50 to-emerald-50">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">Готов выигрывать тендеры?</h2>
          <p className="text-slate-600 text-lg mb-8 max-w-2xl mx-auto">
            Загрузите РУ с приложением — через 5 минут увидите медтендеры, где ваш каталог совпадает с ТЗ заказчика
          </p>
          <Link href="/auth/register" className="inline-flex items-center gap-2 px-10 py-4 rounded-xl font-medium text-white text-lg transition-all hover:opacity-90 animate-pulse-glow btn-primary">
            Начать бесплатно — 7 дней
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Футер */}
      <footer className="border-t border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center btn-primary">
              <Zap size={12} className="text-white" />
            </div>
            <span className="font-bold text-slate-900">TenderAI</span>
          </div>
          <p className="text-slate-500 text-sm">© 2026 TenderAI. Все права защищены.</p>
          <div className="flex gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-slate-900 transition-colors">Политика конфиденциальности</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Условия использования</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
