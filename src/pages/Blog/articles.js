export const articleImages = [
  "https://images.unsplash.com/photo-1483450388369-9ed95738483c?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
];

export const articleSlugs = [
  "air-passenger-rights",
  "why-airlines-delay-payments",
  "stress-free-travel-tips",
];

export const fallbackArticleDetails = [
  {
    readTime: "5 min read",
    sections: [
      {
        title: "What passenger rights usually cover",
        body: "When a flight is delayed, cancelled, overbooked, or causes a missed connection, passengers may have compensation rights depending on the route, airline responsibility, and arrival delay. The important first step is to keep your booking reference, boarding pass, and any airline messages.",
      },
      {
        title: "Why timing matters",
        body: "Eligibility is often tied to the final arrival time, not only the departure delay. A disruption that looks small at the gate can still become claimable if you arrive several hours late at your final destination.",
      },
      {
        title: "How Fly Friendly helps",
        body: "Fly Friendly checks the disruption details, organizes the claim evidence, and handles communication with the airline so passengers do not have to navigate policy language alone.",
      },
    ],
  },
  {
    readTime: "4 min read",
    sections: [
      {
        title: "Airlines review claims carefully",
        body: "Compensation claims can take time because airlines review operational records, weather reports, airport restrictions, and internal disruption notes before accepting liability.",
      },
      {
        title: "Missing documents slow things down",
        body: "The most common delays come from incomplete passenger details, missing booking references, or unclear flight timelines. A clean claim file makes the process easier to defend.",
      },
      {
        title: "How we speed up the process",
        body: "We structure the claim clearly, submit the right evidence, track responses, and follow up when airlines delay decisions longer than expected.",
      },
    ],
  },
  {
    readTime: "6 min read",
    sections: [
      {
        title: "Book with disruption risk in mind",
        body: "Direct flights, realistic connection windows, and morning departures can reduce the chance that one delay ruins the rest of your trip.",
      },
      {
        title: "Keep a simple travel record",
        body: "Save boarding passes, screenshots of delay notifications, booking confirmations, and arrival times. These details are easy to forget after a stressful travel day.",
      },
      {
        title: "Know when to check compensation",
        body: "If your arrival was delayed by several hours, your flight was cancelled close to departure, or you were denied boarding, it is worth checking your eligibility before moving on.",
      },
    ],
  },
];

export function getArticles(translatedArticles, translatedDetails = fallbackArticleDetails) {
  const details = Array.isArray(translatedDetails) ? translatedDetails : fallbackArticleDetails;

  return translatedArticles.map((item, index) => ({
    ...item,
    ...(details[index] || fallbackArticleDetails[index]),
    image: articleImages[index],
    slug: articleSlugs[index],
  }));
}
