import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPublicSiteUrl } from "../_shared/site-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LeadRecord = {
  id: string;
  lead_code: string;
  full_name: string | null;
  email: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  airline: string | null;
  status: string | null;
  eligibility_status: string | null;
  preferred_language: string | null;
  payload: Record<string, unknown> | null;
  submitted_at: string | null;
  customer_confirmation_sent_at: string | null;
};

type ClaimConfirmationRequest = {
  leadId?: string;
  portalActionUrl?: string;
  portalActionLabel?: string;
  portalLoginUrl?: string;
};

type ResendResponsePayload = {
  id?: string;
  message?: string;
  error?: string;
};

const supportedLanguages = new Set([
  "az",
  "ru",
  "en",
  "es",
  "fr",
  "pt",
  "de",
  "it",
  "tr",
  "ka",
  "uk",
  "pl",
]);

const emailCopy = {
  en: {
    subject: (claimId: string) => `Thank you for submitting your claim - ${claimId}`,
    preview: "Your Fly Friendly claim has been received.",
    greeting: "Hi",
    headline: "Your compensation claim has been safely received.",
    intro: "Thank you for trusting Fly Friendly. We have successfully received your application and our team has started reviewing your case.",
    claimReference: "Claim reference",
    route: "Route",
    airline: "Airline",
    routePending: "Route details pending",
    airlineFallback: "your airline",
    nextTitle: "What happens next",
    step1Title: "1. Case review and preparation",
    step1Text: "We review your claim, check the details, and prepare the submission. If we need anything else from you, we will contact you by email.",
    step2Title: "2. Communication with the airline",
    step2Text: (airline: string) => `We handle correspondence with ${airline} on your behalf. Airline responses can take several weeks or months, but we will keep you informed about important updates.`,
    step3Title: "3. Compensation payment",
    step3Text: "Once your claim is successful, we will contact you to arrange the payment. Our service fee is charged only after you receive your compensation.",
    missionTitle: "At Fly Friendly, our goal is simple.",
    missionText: "We stand by your side when your flight does not go as planned.",
    contactsTitle: "Need help?",
    contactsText: "Reply to this email or use the contact details below and our team will assist you.",
    emailLabel: "Email",
    websiteLabel: "Website",
    contactPageLabel: "Contact page",
    signoff: "Best regards",
    team: "The Fly Friendly Team",
  },
  ru: {
    subject: (claimId: string) => `Спасибо за отправку заявки - ${claimId}`,
    preview: "Ваша заявка Fly Friendly успешно получена.",
    greeting: "Здравствуйте",
    headline: "Ваша заявка на компенсацию успешно получена.",
    intro: "Спасибо, что доверили свою заявку Fly Friendly. Мы успешно получили ваше обращение, и наша команда уже начала работу по вашему делу.",
    claimReference: "Номер заявки",
    route: "Маршрут",
    airline: "Авиакомпания",
    routePending: "Детали маршрута уточняются",
    airlineFallback: "ваша авиакомпания",
    nextTitle: "Что будет дальше",
    step1Title: "1. Проверка и подготовка дела",
    step1Text: "Мы проверим вашу заявку, сверим детали и подготовим материалы для отправки. Если от вас понадобятся дополнительные документы или информация, мы свяжемся с вами по email.",
    step2Title: "2. Общение с авиакомпанией",
    step2Text: (airline: string) => `Мы берём на себя переписку с ${airline}. Ответ от авиакомпании может занять несколько недель или месяцев, но мы сообщим вам обо всех важных обновлениях.`,
    step3Title: "3. Выплата компенсации",
    step3Text: "Если заявка будет успешной, мы свяжемся с вами для организации выплаты компенсации. Наша комиссия взимается только после того, как вы получите деньги.",
    missionTitle: "Цель Fly Friendly проста.",
    missionText: "Мы на вашей стороне, когда полёт идёт не по плану.",
    contactsTitle: "Нужна помощь?",
    contactsText: "Ответьте на это письмо или воспользуйтесь контактами ниже — наша команда поможет вам.",
    emailLabel: "Email",
    websiteLabel: "Сайт",
    contactPageLabel: "Страница контактов",
    signoff: "С уважением",
    team: "Команда Fly Friendly",
  },
  az: {
    subject: (claimId: string) => `Müraciətinizi göndərdiyiniz üçün təşəkkür edirik - ${claimId}`,
    preview: "Fly Friendly müraciətiniz uğurla qəbul edildi.",
    greeting: "Salam",
    headline: "Kompensasiya müraciətiniz uğurla qəbul edildi.",
    intro: "Fly Friendly-yə güvəndiyiniz üçün təşəkkür edirik. Müraciətinizi uğurla qəbul etdik və komandamız artıq işə başlayıb.",
    claimReference: "Müraciət nömrəsi",
    route: "Marşrut",
    airline: "Aviaşirkət",
    routePending: "Marşrut detalları gözlənilir",
    airlineFallback: "sizin aviaşirkətiniz",
    nextTitle: "Növbəti mərhələlər",
    step1Title: "1. Yoxlama və hazırlıq",
    step1Text: "Müraciətinizi yoxlayır, detalları dəqiqləşdirir və təqdimat üçün hazırlayırıq. Əlavə sənəd və ya məlumat lazım olsa, sizə email ilə yazacağıq.",
    step2Title: "2. Aviaşirkətlə əlaqə",
    step2Text: (airline: string) => `${airline} ilə yazışmanı sizin adınızdan biz aparırıq. Cavab bir neçə həftə və ya ay çəkə bilər, amma bütün vacib yeniliklər barədə sizi məlumatlandıracağıq.`,
    step3Title: "3. Kompensasiyanın ödənişi",
    step3Text: "Müraciətiniz uğurlu olduqda kompensasiyanın ödənilməsi üçün sizinlə əlaqə saxlayacağıq. Xidmət haqqımız yalnız pulu aldıqdan sonra tutulur.",
    missionTitle: "Fly Friendly-nin məqsədi sadədir.",
    missionText: "Uçuşunuz plan üzrə getməyəndə sizin tərəfinizdə oluruq.",
    contactsTitle: "Köməyə ehtiyac var?",
    contactsText: "Bu email-ə cavab yazın və ya aşağıdakı əlaqələrdən istifadə edin, komandamız sizə kömək edəcək.",
    emailLabel: "Email",
    websiteLabel: "Sayt",
    contactPageLabel: "Əlaqə səhifəsi",
    signoff: "Hörmətlə",
    team: "Fly Friendly komandası",
  },
  es: {
    subject: (claimId: string) => `Gracias por enviar tu reclamación - ${claimId}`,
    preview: "Hemos recibido tu reclamación en Fly Friendly.",
    greeting: "Hola",
    headline: "Tu reclamación de compensación ha sido recibida correctamente.",
    intro: "Gracias por confiar en Fly Friendly. Hemos recibido tu solicitud y nuestro equipo ya ha comenzado a revisar tu caso.",
    claimReference: "Referencia de reclamación",
    route: "Ruta",
    airline: "Aerolínea",
    routePending: "Detalles de la ruta pendientes",
    airlineFallback: "tu aerolínea",
    nextTitle: "Qué ocurre ahora",
    step1Title: "1. Revisión y preparación del caso",
    step1Text: "Revisamos tu reclamación, comprobamos los detalles y preparamos el envío. Si necesitamos algún documento o dato adicional, te contactaremos por email.",
    step2Title: "2. Comunicación con la aerolínea",
    step2Text: (airline: string) => `Nos encargamos de la comunicación con ${airline} en tu nombre. La respuesta puede tardar varias semanas o meses, pero te mantendremos informado de cualquier novedad importante.`,
    step3Title: "3. Pago de la compensación",
    step3Text: "Cuando tu reclamación tenga éxito, nos pondremos en contacto contigo para organizar el pago. Nuestra comisión solo se cobra después de que recibas tu compensación.",
    missionTitle: "En Fly Friendly, nuestro objetivo es simple.",
    missionText: "Estamos de tu lado cuando tu vuelo no sale como estaba previsto.",
    contactsTitle: "¿Necesitas ayuda?",
    contactsText: "Responde a este correo o utiliza los contactos de abajo y nuestro equipo te ayudará.",
    emailLabel: "Email",
    websiteLabel: "Web",
    contactPageLabel: "Página de contacto",
    signoff: "Saludos",
    team: "Equipo Fly Friendly",
  },
  fr: {
    subject: (claimId: string) => `Merci pour l'envoi de votre réclamation - ${claimId}`,
    preview: "Votre réclamation Fly Friendly a bien été reçue.",
    greeting: "Bonjour",
    headline: "Votre demande d'indemnisation a bien été reçue.",
    intro: "Merci de faire confiance à Fly Friendly. Nous avons bien reçu votre dossier et notre équipe a déjà commencé à examiner votre cas.",
    claimReference: "Référence du dossier",
    route: "Itinéraire",
    airline: "Compagnie aérienne",
    routePending: "Détails de l'itinéraire en attente",
    airlineFallback: "votre compagnie aérienne",
    nextTitle: "Prochaines étapes",
    step1Title: "1. Vérification et préparation du dossier",
    step1Text: "Nous examinons votre réclamation, vérifions les détails et préparons l'envoi. Si nous avons besoin de documents ou d'informations supplémentaires, nous vous contacterons par email.",
    step2Title: "2. Communication avec la compagnie aérienne",
    step2Text: (airline: string) => `Nous gérons les échanges avec ${airline} pour vous. La réponse de la compagnie peut prendre plusieurs semaines ou mois, mais nous vous informerons de toute mise à jour importante.`,
    step3Title: "3. Paiement de l'indemnisation",
    step3Text: "Lorsque votre réclamation aboutit, nous vous contactons pour organiser le paiement. Nos frais ne sont facturés qu'après réception de votre indemnisation.",
    missionTitle: "Chez Fly Friendly, notre objectif est simple.",
    missionText: "Nous restons à vos côtés lorsque votre vol ne se déroule pas comme prévu.",
    contactsTitle: "Besoin d'aide ?",
    contactsText: "Répondez à cet email ou utilisez les coordonnées ci-dessous et notre équipe vous aidera.",
    emailLabel: "Email",
    websiteLabel: "Site web",
    contactPageLabel: "Page de contact",
    signoff: "Bien cordialement",
    team: "L'équipe Fly Friendly",
  },
  pt: {
    subject: (claimId: string) => `Obrigado por enviar o seu pedido - ${claimId}`,
    preview: "Recebemos o seu pedido na Fly Friendly.",
    greeting: "Olá",
    headline: "O seu pedido de compensação foi recebido com sucesso.",
    intro: "Obrigado por confiar na Fly Friendly. Recebemos a sua candidatura e a nossa equipa já começou a analisar o seu caso.",
    claimReference: "Referência do pedido",
    route: "Rota",
    airline: "Companhia aérea",
    routePending: "Detalhes da rota pendentes",
    airlineFallback: "a sua companhia aérea",
    nextTitle: "O que acontece a seguir",
    step1Title: "1. Revisão e preparação do caso",
    step1Text: "Analisamos o seu pedido, confirmamos os detalhes e preparamos a submissão. Se precisarmos de documentos ou informações adicionais, entraremos em contacto por email.",
    step2Title: "2. Comunicação com a companhia aérea",
    step2Text: (airline: string) => `Tratamos da comunicação com a ${airline} em seu nome. A resposta pode demorar várias semanas ou meses, mas manteremos você informado sobre atualizações importantes.`,
    step3Title: "3. Pagamento da compensação",
    step3Text: "Quando o seu pedido for bem-sucedido, entraremos em contacto para organizar o pagamento. A nossa comissão só é cobrada depois de receber a compensação.",
    missionTitle: "Na Fly Friendly, o nosso objetivo é simples.",
    missionText: "Estamos do seu lado quando o seu voo não corre como planeado.",
    contactsTitle: "Precisa de ajuda?",
    contactsText: "Responda a este email ou use os contactos abaixo e a nossa equipa ajudará.",
    emailLabel: "Email",
    websiteLabel: "Website",
    contactPageLabel: "Página de contacto",
    signoff: "Com os melhores cumprimentos",
    team: "Equipa Fly Friendly",
  },
  de: {
    subject: (claimId: string) => `Vielen Dank für das Einreichen Ihres Anspruchs - ${claimId}`,
    preview: "Ihr Fly Friendly Anspruch wurde erfolgreich empfangen.",
    greeting: "Hallo",
    headline: "Ihr Entschädigungsanspruch wurde erfolgreich erhalten.",
    intro: "Vielen Dank für Ihr Vertrauen in Fly Friendly. Wir haben Ihren Antrag erhalten und unser Team hat bereits mit der Prüfung begonnen.",
    claimReference: "Vorgangsnummer",
    route: "Strecke",
    airline: "Fluggesellschaft",
    routePending: "Streckendetails stehen noch aus",
    airlineFallback: "Ihre Fluggesellschaft",
    nextTitle: "Wie geht es weiter",
    step1Title: "1. Prüfung und Vorbereitung",
    step1Text: "Wir prüfen Ihren Anspruch, bestätigen die Details und bereiten die Einreichung vor. Falls wir weitere Unterlagen oder Informationen benötigen, kontaktieren wir Sie per Email.",
    step2Title: "2. Kommunikation mit der Fluggesellschaft",
    step2Text: (airline: string) => `Wir übernehmen die Kommunikation mit ${airline} in Ihrem Namen. Eine Antwort kann mehrere Wochen oder Monate dauern, aber wir informieren Sie über wichtige Updates.`,
    step3Title: "3. Auszahlung der Entschädigung",
    step3Text: "Sobald Ihr Anspruch erfolgreich ist, kontaktieren wir Sie zur Auszahlung. Unsere Servicegebühr wird erst fällig, nachdem Sie Ihre Entschädigung erhalten haben.",
    missionTitle: "Bei Fly Friendly ist unser Ziel einfach.",
    missionText: "Wir stehen an Ihrer Seite, wenn Ihr Flug nicht wie geplant verläuft.",
    contactsTitle: "Brauchen Sie Hilfe?",
    contactsText: "Antworten Sie auf diese Email oder nutzen Sie die Kontaktdaten unten, unser Team hilft Ihnen gerne weiter.",
    emailLabel: "Email",
    websiteLabel: "Website",
    contactPageLabel: "Kontaktseite",
    signoff: "Mit freundlichen Grüßen",
    team: "Das Fly Friendly Team",
  },
  it: {
    subject: (claimId: string) => `Grazie per aver inviato il tuo reclamo - ${claimId}`,
    preview: "Abbiamo ricevuto il tuo reclamo Fly Friendly.",
    greeting: "Ciao",
    headline: "La tua richiesta di compensazione è stata ricevuta con successo.",
    intro: "Grazie per aver scelto Fly Friendly. Abbiamo ricevuto la tua richiesta e il nostro team ha già iniziato a esaminare il tuo caso.",
    claimReference: "Riferimento pratica",
    route: "Tratta",
    airline: "Compagnia aerea",
    routePending: "Dettagli della tratta in attesa",
    airlineFallback: "la tua compagnia aerea",
    nextTitle: "Cosa succede ora",
    step1Title: "1. Revisione e preparazione del caso",
    step1Text: "Esaminiamo il tuo reclamo, verifichiamo i dettagli e prepariamo l'invio. Se avremo bisogno di documenti o informazioni aggiuntive, ti contatteremo via email.",
    step2Title: "2. Comunicazione con la compagnia aerea",
    step2Text: (airline: string) => `Gestiamo la comunicazione con ${airline} per tuo conto. La risposta può richiedere settimane o mesi, ma ti terremo aggiornato su ogni novità importante.`,
    step3Title: "3. Pagamento del risarcimento",
    step3Text: "Quando il tuo reclamo andrà a buon fine, ti contatteremo per organizzare il pagamento. La nostra commissione viene addebitata solo dopo che ricevi il risarcimento.",
    missionTitle: "In Fly Friendly il nostro obiettivo è semplice.",
    missionText: "Siamo al tuo fianco quando il tuo volo non va come previsto.",
    contactsTitle: "Hai bisogno di aiuto?",
    contactsText: "Rispondi a questa email oppure usa i contatti qui sotto e il nostro team ti assisterà.",
    emailLabel: "Email",
    websiteLabel: "Sito web",
    contactPageLabel: "Pagina contatti",
    signoff: "Cordiali saluti",
    team: "Team Fly Friendly",
  },
  tr: {
    subject: (claimId: string) => `Talebinizi gönderdiğiniz için teşekkür ederiz - ${claimId}`,
    preview: "Fly Friendly talebiniz başarıyla alındı.",
    greeting: "Merhaba",
    headline: "Tazminat talebiniz başarıyla alındı.",
    intro: "Fly Friendly'ye güvendiğiniz için teşekkür ederiz. Başvurunuzu aldık ve ekibimiz dosyanızı incelemeye başladı.",
    claimReference: "Talep referansı",
    route: "Rota",
    airline: "Havayolu",
    routePending: "Rota detayları bekleniyor",
    airlineFallback: "havayolunuz",
    nextTitle: "Sırada ne var",
    step1Title: "1. İnceleme ve hazırlık",
    step1Text: "Talebinizi inceliyor, detayları kontrol ediyor ve başvuruyu hazırlıyoruz. Ek belge veya bilgi gerekirse size email ile ulaşacağız.",
    step2Title: "2. Havayolu ile iletişim",
    step2Text: (airline: string) => `${airline} ile yazışmaları sizin adınıza biz yürütüyoruz. Yanıt haftalar veya aylar sürebilir, ancak önemli gelişmeler hakkında sizi bilgilendireceğiz.`,
    step3Title: "3. Tazminat ödemesi",
    step3Text: "Talebiniz olumlu sonuçlandığında ödemenin düzenlenmesi için sizinle iletişime geçeceğiz. Hizmet ücretimiz yalnızca tazminatınızı aldıktan sonra tahsil edilir.",
    missionTitle: "Fly Friendly'de hedefimiz basit.",
    missionText: "Uçuşunuz planlandığı gibi gitmediğinde yanınızda oluruz.",
    contactsTitle: "Yardıma mı ihtiyacınız var?",
    contactsText: "Bu email'i yanıtlayın veya aşağıdaki iletişim bilgilerini kullanın, ekibimiz size yardımcı olacaktır.",
    emailLabel: "Email",
    websiteLabel: "Web sitesi",
    contactPageLabel: "İletişim sayfası",
    signoff: "Saygılarımızla",
    team: "Fly Friendly Ekibi",
  },
  ka: {
    subject: (claimId: string) => `გმადლობთ მოთხოვნის გაგზავნისთვის - ${claimId}`,
    preview: "თქვენი Fly Friendly მოთხოვნა მიღებულია.",
    greeting: "გამარჯობა",
    headline: "თქვენი კომპენსაციის მოთხოვნა წარმატებით მივიღეთ.",
    intro: "გმადლობთ Fly Friendly-ის ნდობისთვის. თქვენი განაცხადი მიღებულია და ჩვენი გუნდი უკვე მუშაობს თქვენს საქმეზე.",
    claimReference: "მოთხოვნის ნომერი",
    route: "მარშრუტი",
    airline: "ავიაკომპანია",
    routePending: "მარშრუტის დეტალები მოსალოდნელია",
    airlineFallback: "თქვენი ავიაკომპანია",
    nextTitle: "შემდეგი ეტაპები",
    step1Title: "1. განხილვა და მომზადება",
    step1Text: "ჩვენ ვამოწმებთ თქვენს მოთხოვნას, ვადასტურებთ დეტალებს და ვამზადებთ გაგზავნას. თუ დამატებითი დოკუმენტი ან ინფორმაცია დაგვჭირდება, email-ით დაგიკავშირდებით.",
    step2Title: "2. კომუნიკაცია ავიაკომპანიასთან",
    step2Text: (airline: string) => `ჩვენ ვაწარმოებთ მიმოწერას ${airline}-თან თქვენი სახელით. პასუხს შეიძლება რამდენიმე კვირა ან თვე დასჭირდეს, მაგრამ ყველა მნიშვნელოვან განახლებას შეგატყობინებთ.`,
    step3Title: "3. კომპენსაციის გადახდა",
    step3Text: "როცა თქვენი მოთხოვნა წარმატებული იქნება, გადახდის ორგანიზებისთვის დაგიკავშირდებით. ჩვენი საკომისიო მხოლოდ მას შემდეგ ჩამოიჭრება, რაც კომპენსაციას მიიღებთ.",
    missionTitle: "Fly Friendly-ის მიზანი მარტივია.",
    missionText: "ჩვენ თქვენს გვერდით ვართ, როცა ფრენა გეგმის მიხედვით არ მიდის.",
    contactsTitle: "გჭირდებათ დახმარება?",
    contactsText: "უპასუხეთ ამ email-ს ან გამოიყენეთ ქვემოთ მოცემული კონტაქტები და ჩვენი გუნდი დაგეხმარებათ.",
    emailLabel: "Email",
    websiteLabel: "ვებსაიტი",
    contactPageLabel: "კონტაქტის გვერდი",
    signoff: "პატივისცემით",
    team: "Fly Friendly გუნდი",
  },
  uk: {
    subject: (claimId: string) => `Дякуємо за подання вашої заявки - ${claimId}`,
    preview: "Вашу заявку Fly Friendly успішно отримано.",
    greeting: "Вітаємо",
    headline: "Вашу заявку на компенсацію успішно отримано.",
    intro: "Дякуємо, що довірили свою заявку Fly Friendly. Ми отримали ваше звернення, і наша команда вже почала роботу над вашою справою.",
    claimReference: "Номер заявки",
    route: "Маршрут",
    airline: "Авіакомпанія",
    routePending: "Деталі маршруту уточнюються",
    airlineFallback: "ваша авіакомпанія",
    nextTitle: "Що буде далі",
    step1Title: "1. Перевірка та підготовка справи",
    step1Text: "Ми перевіряємо вашу заявку, уточнюємо деталі та готуємо подання. Якщо знадобляться додаткові документи чи інформація, ми зв'яжемося з вами електронною поштою.",
    step2Title: "2. Комунікація з авіакомпанією",
    step2Text: (airline: string) => `Ми беремо на себе листування з ${airline}. Відповідь може зайняти кілька тижнів або місяців, але ми повідомимо вас про всі важливі оновлення.`,
    step3Title: "3. Виплата компенсації",
    step3Text: "Коли заявка буде успішною, ми зв'яжемося з вами для організації виплати. Наша комісія стягується лише після того, як ви отримаєте компенсацію.",
    missionTitle: "Мета Fly Friendly проста.",
    missionText: "Ми на вашому боці, коли політ іде не за планом.",
    contactsTitle: "Потрібна допомога?",
    contactsText: "Відповідайте на цей лист або скористайтеся контактами нижче — наша команда допоможе вам.",
    emailLabel: "Email",
    websiteLabel: "Сайт",
    contactPageLabel: "Сторінка контактів",
    signoff: "З повагою",
    team: "Команда Fly Friendly",
  },
  pl: {
    subject: (claimId: string) => `Dziękujemy za przesłanie roszczenia - ${claimId}`,
    preview: "Twoje zgłoszenie Fly Friendly zostało odebrane.",
    greeting: "Cześć",
    headline: "Twoje roszczenie o odszkodowanie zostało pomyślnie odebrane.",
    intro: "Dziękujemy za zaufanie do Fly Friendly. Otrzymaliśmy Twoje zgłoszenie, a nasz zespół rozpoczął już analizę sprawy.",
    claimReference: "Numer zgłoszenia",
    route: "Trasa",
    airline: "Linia lotnicza",
    routePending: "Szczegóły trasy oczekują",
    airlineFallback: "Twoja linia lotnicza",
    nextTitle: "Co dzieje się dalej",
    step1Title: "1. Weryfikacja i przygotowanie sprawy",
    step1Text: "Sprawdzamy Twoje roszczenie, potwierdzamy szczegóły i przygotowujemy zgłoszenie. Jeśli będziemy potrzebować dodatkowych dokumentów lub informacji, skontaktujemy się z Tobą mailowo.",
    step2Title: "2. Kontakt z linią lotniczą",
    step2Text: (airline: string) => `Prowadzimy korespondencję z ${airline} w Twoim imieniu. Odpowiedź może potrwać kilka tygodni lub miesięcy, ale poinformujemy Cię o każdej ważnej aktualizacji.`,
    step3Title: "3. Wypłata odszkodowania",
    step3Text: "Gdy roszczenie zakończy się sukcesem, skontaktujemy się z Tobą w sprawie wypłaty. Nasza prowizja jest pobierana dopiero po otrzymaniu przez Ciebie odszkodowania.",
    missionTitle: "Cel Fly Friendly jest prosty.",
    missionText: "Jesteśmy po Twojej stronie, gdy lot nie przebiega zgodnie z planem.",
    contactsTitle: "Potrzebujesz pomocy?",
    contactsText: "Odpowiedz na tę wiadomość lub skorzystaj z kontaktów poniżej, a nasz zespół Ci pomoże.",
    emailLabel: "Email",
    websiteLabel: "Strona",
    contactPageLabel: "Strona kontaktowa",
    signoff: "Z poważaniem",
    team: "Zespół Fly Friendly",
  },
} as const;

const portalCopy = {
  en: {
    title: "Access your client portal",
    amountPrompt: "To find out your compensation amount, log in to your personal account.",
    text: "You can create your password and follow your claim in your personal Fly Friendly account.",
    createPassword: "Create password",
    accessPortal: "Access your portal",
    loginLabel: "Client portal login",
  },
  ru: {
    title: "Доступ в личный кабинет",
    amountPrompt: "Чтобы узнать сумму компенсации, войдите в свой личный кабинет.",
    text: "Вы можете создать пароль и отслеживать статус заявки в личном кабинете Fly Friendly.",
    createPassword: "Создать пароль",
    accessPortal: "Открыть кабинет",
    loginLabel: "Вход в личный кабинет",
  },
  az: {
    title: "Müştəri kabinetinə giriş",
    amountPrompt: "Kompensasiya məbləğini öyrənmək üçün şəxsi kabinetinizə daxil olun.",
    text: "Şəxsi Fly Friendly hesabınızda parol yarada və müraciətinizin statusunu izləyə bilərsiniz.",
    createPassword: "Parol yarat",
    accessPortal: "Kabinetə keç",
    loginLabel: "Müştəri kabinetinə giriş",
  },
  es: {
    title: "Accede a tu portal de cliente",
    text: "Puedes crear tu contraseña y seguir tu reclamación en tu cuenta personal de Fly Friendly.",
    createPassword: "Crear contraseña",
    accessPortal: "Abrir portal",
    loginLabel: "Acceso al portal",
  },
  fr: {
    title: "Accédez à votre portail client",
    text: "Vous pouvez créer votre mot de passe et suivre votre dossier dans votre compte Fly Friendly.",
    createPassword: "Créer un mot de passe",
    accessPortal: "Ouvrir le portail",
    loginLabel: "Connexion au portail",
  },
  pt: {
    title: "Aceda ao seu portal de cliente",
    text: "Pode criar a sua palavra-passe e acompanhar o pedido na sua conta Fly Friendly.",
    createPassword: "Criar palavra-passe",
    accessPortal: "Abrir portal",
    loginLabel: "Login do portal",
  },
  de: {
    title: "Zugang zu Ihrem Kundenportal",
    text: "Sie können ein Passwort erstellen und Ihren Anspruch in Ihrem Fly Friendly Konto verfolgen.",
    createPassword: "Passwort erstellen",
    accessPortal: "Portal öffnen",
    loginLabel: "Portal-Anmeldung",
  },
  it: {
    title: "Accedi al tuo portale cliente",
    text: "Puoi creare la tua password e seguire la richiesta nel tuo account Fly Friendly.",
    createPassword: "Crea password",
    accessPortal: "Apri il portale",
    loginLabel: "Accesso al portale",
  },
  tr: {
    title: "Müşteri portalınıza erişin",
    text: "Şifrenizi oluşturabilir ve talebinizi Fly Friendly hesabınızdan takip edebilirsiniz.",
    createPassword: "Şifre oluştur",
    accessPortal: "Portala git",
    loginLabel: "Portal girişi",
  },
  ka: {
    title: "შედით თქვენს კლიენტის პორტალში",
    text: "შეგიძლიათ შექმნათ პაროლი და თქვენს Fly Friendly ანგარიშში მოთხოვნის სტატუსი აკონტროლოთ.",
    createPassword: "პაროლის შექმნა",
    accessPortal: "პორტალის გახსნა",
    loginLabel: "პორტალში შესვლა",
  },
  uk: {
    title: "Доступ до клієнтського кабінету",
    text: "Ви можете створити пароль і відстежувати заявку у своєму акаунті Fly Friendly.",
    createPassword: "Створити пароль",
    accessPortal: "Відкрити кабінет",
    loginLabel: "Вхід до кабінету",
  },
  pl: {
    title: "Uzyskaj dostęp do portalu klienta",
    text: "Możesz utworzyć hasło i śledzić zgłoszenie na swoim koncie Fly Friendly.",
    createPassword: "Utwórz hasło",
    accessPortal: "Otwórz portal",
    loginLabel: "Logowanie do portalu",
  },
} as const;

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function routeLabel(lead: LeadRecord) {
  const from = lead.departure_airport?.trim();
  const to = lead.arrival_airport?.trim();

  if (from && to) return `${from} -> ${to}`;
  return from || to || "Route details pending";
}

function resolveLanguage(lead: LeadRecord) {
  const fromPreferred = String(lead.preferred_language || "").toLowerCase();
  if (supportedLanguages.has(fromPreferred)) return fromPreferred;

  const payloadLanguage = String(lead.payload?.preferredLanguage || lead.payload?.language || "").toLowerCase();
  if (supportedLanguages.has(payloadLanguage)) return payloadLanguage;

  return "en";
}

function getCopy(language: string) {
  return emailCopy[language as keyof typeof emailCopy] || emailCopy.en;
}

function getPortalCopy(language: string) {
  return portalCopy[language as keyof typeof portalCopy] || portalCopy.en;
}

function buildBrandHeader() {
  return `
    <div style="display:inline-flex;align-items:center;gap:12px;padding:10px 18px;border-radius:999px;background:#ffffff;border:1px solid #d9e7ff;box-shadow:0 12px 30px rgba(31,122,224,0.10);">
      <span style="display:inline-flex;width:34px;height:34px;border-radius:12px;background:linear-gradient(180deg,#2bb0ff 0%,#1187eb 100%);color:#ffffff;font-size:15px;font-weight:800;align-items:center;justify-content:center;letter-spacing:0.04em;">FF</span>
      <span style="font-size:18px;font-weight:700;letter-spacing:0.01em;color:#1187eb;">Fly Friendly</span>
    </div>
  `.trim();
}

function buildEmailHtml(
  lead: LeadRecord,
  siteUrl: string,
  language: string,
  options: {
    portalActionUrl?: string | null;
    portalActionLabel?: string | null;
    portalLoginUrl?: string | null;
  } = {},
) {
  const copy = getCopy(language);
  const portal = getPortalCopy(language);
  const greetingName = escapeHtml(lead.full_name || "");
  const greetingLine = greetingName ? `${escapeHtml(copy.greeting)} ${greetingName},` : `${escapeHtml(copy.greeting)},`;
  const claimId = escapeHtml(lead.lead_code);
  const route = escapeHtml(lead.departure_airport?.trim() && lead.arrival_airport?.trim()
    ? `${lead.departure_airport.trim()} -> ${lead.arrival_airport.trim()}`
    : lead.departure_airport?.trim() || lead.arrival_airport?.trim() || copy.routePending);
  const airline = escapeHtml(lead.airline || copy.airlineFallback);
  const safeSiteUrl = escapeHtml(siteUrl);
  const contactUrl = escapeHtml(`${siteUrl.replace(/\/$/, "")}/${language}/contact`);
  const websiteLabel = escapeHtml(copy.websiteLabel);
  const contactPageLabel = escapeHtml(copy.contactPageLabel);
  const emailLabel = escapeHtml(copy.emailLabel);
  const contactsTitle = escapeHtml(copy.contactsTitle);
  const contactsText = escapeHtml(copy.contactsText);
  const missionTitle = escapeHtml(copy.missionTitle);
  const missionText = escapeHtml(copy.missionText);
  const portalActionUrl = options.portalActionUrl ? escapeHtml(options.portalActionUrl) : "";
  const portalActionLabel = escapeHtml(options.portalActionLabel || portal.createPassword);
  const portalLoginUrl = options.portalLoginUrl ? escapeHtml(options.portalLoginUrl) : "";
  const portalBlock = portalActionUrl
    ? `
            <div style="margin:0 0 28px;padding:24px;border-radius:22px;background:linear-gradient(180deg,#f2f8ff 0%,#f8fbff 100%);border:1px solid #dce9ff;">
              <p style="margin:0 0 10px;font-size:22px;line-height:1.35;font-weight:700;color:#172033;">${escapeHtml(portal.title)}</p>
              <p style="margin:0 0 12px;font-size:16px;line-height:1.7;font-weight:700;color:#172033;">${escapeHtml(portal.amountPrompt || portalCopy.en.amountPrompt)}</p>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#55627a;">${escapeHtml(portal.text)}</p>
              <a href="${portalActionUrl}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#1187eb;color:#ffffff;text-decoration:none;font-weight:700;">${portalActionLabel}</a>
              ${portalLoginUrl ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#55627a;">${escapeHtml(portal.loginLabel)}: <a href="${portalLoginUrl}" style="color:#1187eb;text-decoration:none;">${portalLoginUrl}</a></p>` : ""}
            </div>
    `.trim()
    : "";

  return `
<!DOCTYPE html>
<html lang="${language}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fly Friendly claim confirmation</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef4ff;font-family:Arial,sans-serif;color:#172033;">
    <div style="padding:28px 12px;background:
      radial-gradient(circle at top left, rgba(31,122,224,0.14), transparent 34%),
      radial-gradient(circle at top right, rgba(25,184,74,0.09), transparent 28%),
      linear-gradient(180deg,#eef6ff 0%,#f8fbff 100%);
    ">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;margin:0 auto;">
        <tr>
          <td style="padding-bottom:16px;text-align:center;">
            ${buildBrandHeader()}
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:30px;padding:40px 32px;box-shadow:0 20px 50px rgba(32,85,165,0.12);border:1px solid #e2eeff;">
            <p style="margin:0 0 12px;font-size:18px;line-height:1.6;color:#172033;">${greetingLine}</p>
            <h1 style="margin:0 0 16px;font-size:34px;line-height:1.15;color:#19b84a;font-weight:700;">${escapeHtml(copy.headline)}</h1>
            <p style="margin:0 0 24px;font-size:18px;line-height:1.7;color:#55627a;">
              ${escapeHtml(copy.intro)}
            </p>

            ${portalBlock}

            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 28px;background:linear-gradient(180deg,#f8fbff 0%,#f4f9ff 100%);border:1px solid #dce9ff;border-radius:22px;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6f7e96;">${escapeHtml(copy.claimReference)}</p>
                  <p style="margin:0 0 18px;font-size:28px;line-height:1.2;font-weight:700;color:#172033;">${claimId}</p>
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6f7e96;">${escapeHtml(copy.route)}</p>
                  <p style="margin:0 0 18px;font-size:18px;line-height:1.5;color:#172033;">${route}</p>
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6f7e96;">${escapeHtml(copy.airline)}</p>
                  <p style="margin:0;font-size:18px;line-height:1.5;color:#172033;">${airline}</p>
                </td>
              </tr>
            </table>

            <h2 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:#172033;">${escapeHtml(copy.nextTitle)}</h2>

            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 28px;">
              <tr>
                <td style="padding:0 0 18px;">
                  <div style="padding:20px 22px;border-radius:20px;background:#f7fbff;border:1px solid #ddeaff;">
                    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#172033;">${escapeHtml(copy.step1Title)}</p>
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#55627a;">${escapeHtml(copy.step1Text)}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:0 0 18px;">
                  <div style="padding:20px 22px;border-radius:20px;background:#f7fbff;border:1px solid #ddeaff;">
                    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#172033;">${escapeHtml(copy.step2Title)}</p>
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#55627a;">${escapeHtml(copy.step2Text(lead.airline || copy.airlineFallback))}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <div style="padding:20px 22px;border-radius:20px;background:#f7fbff;border:1px solid #ddeaff;">
                    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#172033;">${escapeHtml(copy.step3Title)}</p>
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#55627a;">${escapeHtml(copy.step3Text)}</p>
                  </div>
                </td>
              </tr>
            </table>

            <div style="padding:22px 24px;border-radius:22px;background:linear-gradient(180deg,#132743 0%,#1b3c69 100%);color:#ffffff;">
              <p style="margin:0 0 10px;font-size:20px;line-height:1.4;font-weight:700;">${missionTitle}</p>
              <p style="margin:0;font-size:16px;line-height:1.7;color:#d5def0;">${missionText}</p>
            </div>

            <div style="margin-top:28px;padding:24px;border-radius:22px;background:#f9fbff;border:1px solid #ddeaff;">
              <p style="margin:0 0 10px;font-size:20px;line-height:1.4;font-weight:700;color:#172033;">${contactsTitle}</p>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#55627a;">${contactsText}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:14px;font-weight:700;color:#6f7e96;">${emailLabel}</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:15px;text-align:right;"><a href="mailto:info@fly-friendly.com" style="color:#1187eb;text-decoration:none;">info@fly-friendly.com</a></td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:14px;font-weight:700;color:#6f7e96;">${websiteLabel}</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:15px;text-align:right;"><a href="${safeSiteUrl}" style="color:#1187eb;text-decoration:none;">fly-friendly.com</a></td>
                </tr>
                <tr>
                  <td style="padding:10px 0;font-size:14px;font-weight:700;color:#6f7e96;">${contactPageLabel}</td>
                  <td style="padding:10px 0;font-size:15px;text-align:right;"><a href="${contactUrl}" style="color:#1187eb;text-decoration:none;">${contactUrl}</a></td>
                </tr>
              </table>
            </div>
            <p style="margin:24px 0 0;font-size:16px;line-height:1.7;color:#172033;">
              ${escapeHtml(copy.signoff)},<br />
              ${escapeHtml(copy.team)}
            </p>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>
  `.trim();
}

function buildEmailText(
  lead: LeadRecord,
  siteUrl: string,
  language: string,
  options: {
    portalActionUrl?: string | null;
    portalActionLabel?: string | null;
    portalLoginUrl?: string | null;
  } = {},
) {
  const copy = getCopy(language);
  const portal = getPortalCopy(language);
  const name = lead.full_name || "";
  const claimId = lead.lead_code;
  const route = lead.departure_airport?.trim() && lead.arrival_airport?.trim()
    ? `${lead.departure_airport.trim()} -> ${lead.arrival_airport.trim()}`
    : lead.departure_airport?.trim() || lead.arrival_airport?.trim() || copy.routePending;
  const airline = lead.airline || copy.airlineFallback;
  const contactUrl = `${siteUrl.replace(/\/$/, "")}/${language}/contact`;
  const portalLines = options.portalActionUrl
    ? [
      "",
      portal.title,
      portal.amountPrompt || portalCopy.en.amountPrompt,
      portal.text,
      `${options.portalActionLabel || portal.createPassword}: ${options.portalActionUrl}`,
      options.portalLoginUrl ? `${portal.loginLabel}: ${options.portalLoginUrl}` : "",
    ].filter(Boolean)
    : [];

  return [
    name ? `${copy.greeting} ${name},` : `${copy.greeting},`,
    "",
    copy.intro,
    ...portalLines,
    "",
    `${copy.claimReference}: ${claimId}`,
    `${copy.route}: ${route}`,
    `${copy.airline}: ${airline}`,
    "",
    copy.nextTitle,
    "",
    copy.step1Title,
    copy.step1Text,
    "",
    copy.step2Title,
    copy.step2Text(airline),
    "",
    copy.step3Title,
    copy.step3Text,
    "",
    copy.missionTitle,
    copy.missionText,
    "",
    copy.contactsTitle,
    copy.contactsText,
    `${copy.emailLabel}: info@fly-friendly.com`,
    `${copy.websiteLabel}: fly-friendly.com`,
    `${copy.contactPageLabel}: ${contactUrl}`,
    "",
    `${copy.signoff},`,
    copy.team,
  ].join("\n");
}

function buildTeamEmailHtml(lead: LeadRecord, siteUrl: string) {
  const customerName = escapeHtml(lead.full_name || "Unknown customer");
  const customerEmail = escapeHtml(lead.email || "No email");
  const claimId = escapeHtml(lead.lead_code);
  const route = escapeHtml(routeLabel(lead));
  const airline = escapeHtml(lead.airline || "Not provided");
  const adminUrl = escapeHtml(`${siteUrl.replace(/\/$/, "")}/admin/leads?lead=${lead.id}`);

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>New claim received</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f5f9ff;font-family:Arial,sans-serif;color:#172033;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;box-shadow:0 18px 40px rgba(32,85,165,0.10);">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1f7ae0;">New claim received</p>
          <h1 style="margin:0 0 20px;font-size:30px;line-height:1.2;color:#172033;">${claimId}</h1>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:15px;color:#6f7e96;">Customer</td>
              <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:15px;color:#172033;text-align:right;">${customerName}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:15px;color:#6f7e96;">Email</td>
              <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:15px;color:#172033;text-align:right;">${customerEmail}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:15px;color:#6f7e96;">Route</td>
              <td style="padding:10px 0;border-bottom:1px solid #e5eefc;font-size:15px;color:#172033;text-align:right;">${route}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;font-size:15px;color:#6f7e96;">Airline</td>
              <td style="padding:10px 0;font-size:15px;color:#172033;text-align:right;">${airline}</td>
            </tr>
          </table>
          <div style="padding-top:24px;">
            <a href="${adminUrl}" style="display:inline-block;padding:14px 20px;border-radius:14px;background:#1f7ae0;color:#ffffff;text-decoration:none;font-weight:700;">Open in admin</a>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

function buildTeamEmailText(lead: LeadRecord, siteUrl: string) {
  return [
    "New claim received",
    "",
    `Claim: ${lead.lead_code}`,
    `Customer: ${lead.full_name || "Unknown customer"}`,
    `Email: ${lead.email || "No email"}`,
    `Route: ${routeLabel(lead)}`,
    `Airline: ${lead.airline || "Not provided"}`,
    `Admin: ${siteUrl.replace(/\/$/, "")}/admin/leads?lead=${lead.id}`,
  ].join("\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const siteUrl = getPublicSiteUrl();
  const mailFrom = Deno.env.get("MAIL_FROM") || "Fly Friendly <info@fly-friendly.com>";
  const replyTo = Deno.env.get("MAIL_REPLY_TO") || "info@fly-friendly.com";
  const leadAlertTo = Deno.env.get("LEAD_ALERT_TO") || replyTo;

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase server environment is not configured." }, { status: 500 });
  }

  if (!resendApiKey) {
    return json({ error: "RESEND_API_KEY is missing." }, { status: 500 });
  }

  let body: ClaimConfirmationRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const leadId = body.leadId?.trim();
  const portalActionUrl = body.portalActionUrl?.trim() || null;
  const portalActionLabel = body.portalActionLabel?.trim() || null;
  const portalLoginUrl = body.portalLoginUrl?.trim() || null;
  if (!leadId) {
    return json({ error: "leadId is required." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error: leadError } = await supabase
    .from("leads")
    .select("id, lead_code, full_name, email, departure_airport, arrival_airport, airline, status, eligibility_status, preferred_language, payload, submitted_at, customer_confirmation_sent_at")
    .eq("id", leadId)
    .maybeSingle();

  const lead = data as LeadRecord | null;

  if (leadError) {
    return json({ error: leadError.message }, { status: 500 });
  }

  if (!lead) {
    return json({ error: "Lead not found." }, { status: 404 });
  }

  if (lead.customer_confirmation_sent_at) {
    return json({ sent: true, already_sent: true, leadCode: lead.lead_code });
  }

  if (lead.status !== "submitted" || lead.eligibility_status !== "eligible") {
    return json({ error: "Lead is not ready for confirmation email." }, { status: 409 });
  }

  if (!lead.email) {
    return json({ error: "Lead email is missing." }, { status: 400 });
  }

  const language = resolveLanguage(lead);
  const copy = getCopy(language);
  const subject = copy.subject(lead.lead_code);
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [lead.email],
      reply_to: replyTo,
      subject,
      html: buildEmailHtml(lead, siteUrl, language, { portalActionUrl, portalActionLabel, portalLoginUrl }),
      text: buildEmailText(lead, siteUrl, language, { portalActionUrl, portalActionLabel, portalLoginUrl }),
    }),
  });

  const resendPayload = await resendResponse.json() as ResendResponsePayload;

  if (!resendResponse.ok) {
    const message = resendPayload?.message || resendPayload?.error || "Failed to send email.";
    await supabase
      .from("leads")
      .update({
        customer_confirmation_error: String(message).slice(0, 1000),
      })
      .eq("id", lead.id);
    return json({ error: message }, { status: 502 });
  }

  await supabase
    .from("leads")
    .update({
      customer_confirmation_sent_at: new Date().toISOString(),
      customer_confirmation_message_id: resendPayload?.id || null,
      customer_confirmation_error: null,
    })
    .eq("id", lead.id);

  if (leadAlertTo) {
    const teamResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [leadAlertTo],
        reply_to: replyTo,
        subject: `New claim received - ${lead.lead_code}`,
        html: buildTeamEmailHtml(lead, siteUrl),
        text: buildTeamEmailText(lead, siteUrl),
      }),
    });

    if (!teamResponse.ok) {
      const teamPayload = await teamResponse.json().catch(() => ({})) as ResendResponsePayload;
      const teamMessage = teamPayload?.message || teamPayload?.error || "Failed to send team notification.";
      console.error("Team notification failed", {
        leadId: lead.id,
        message: teamMessage,
      });
    }
  }

  return json({
    sent: true,
    already_sent: false,
    leadCode: lead.lead_code,
    messageId: resendPayload?.id || null,
  });
});
