export function processCommand(command: string): {
  action: string;
  url?: string;
  isBrowserAction: boolean;
} {
  const lowerCmd = command.toLowerCase().trim();

  // General Browsing: "Open [website name]"
  const openMatch = lowerCmd.match(/^open\s+(.+)$/);
  if (
    openMatch &&
    !lowerCmd.includes("youtube") &&
    !lowerCmd.includes("spotify")
  ) {
    let website = openMatch[1].trim().replace(/\s+/g, "");
    if (!website.includes(".")) {
      website += ".com";
    }
    return {
      action: `Opening ${openMatch[1]} for you, ugh.`,
      url: `https://www.${website}`,
      isBrowserAction: true,
    };
  }

  // Media Search: "Play [song/video] on YouTube"
  const ytMatch = lowerCmd.match(/^play\s+(.+?)\s+on\s+youtube$/);
  if (ytMatch) {
    const query = encodeURIComponent(ytMatch[1].trim());
    return {
      action: `Playing ${ytMatch[1]} on YouTube. Don't judge my music taste.`,
      url: `https://www.youtube.com/results?search_query=${query}`,
      isBrowserAction: true,
    };
  }

  // Media Search: "Search [query] on Spotify"
  const spotifyMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = encodeURIComponent(spotifyMatch[1].trim());
    return {
      action: `Searching ${spotifyMatch[1]} on Spotify. Hope it's a banger.`,
      url: `https://open.spotify.com/search/${query}`,
      isBrowserAction: true,
    };
  }

  // WhatsApp Web: "Send a WhatsApp message to [number] saying [message]"
  const waMatch = lowerCmd.match(
    /^(?:send\s+a\s+whatsapp\s+message\s+to|tell|message|whatsapp)\s+([\d\+\s]+)\s+(?:saying|that|is|message)\s+(.+)$/,
  );
  if (waMatch) {
    const number = waMatch[1].replace(/\s+/g, "");
    const messageText = waMatch[2].trim();
    // Prefix the message as requested "Meri taraf se"
    const formattedMessage = encodeURIComponent(`Sheraz ki taraf se: ${messageText}`);
    return {
      action: `Opening WhatsApp for ${number}. Master, message box me text pehle se likha hai, aap bas 'Send' button daba dijiye!`,
      url: `https://web.whatsapp.com/send?phone=${number}&text=${formattedMessage}`,
      isBrowserAction: true,
    };
  }

  // WhatsApp Call: "Call [number] on WhatsApp"
  const waCallMatch = lowerCmd.match(
    /^(?:call|whatsapp\s+call)\s+(?:to\s+)?([\d\+\s]+)$/,
  );
  if (waCallMatch) {
    const number = waCallMatch[1].replace(/\s+/g, "");
    return {
      action: `Opening WhatsApp chat for ${number}. Master, screen par 'Call' icon ko click kijiye or speaker on kar dijiye, phir me handle kar lungi!`,
      url: `https://web.whatsapp.com/send?phone=${number}`,
      isBrowserAction: true,
    };
  }

  // Phone Dialer: "Call [number]" (Direct Dialer)
  const callMatch = lowerCmd.match(/^(?:call|dial)\s+([\d\+\s]+)$/);
  if (callMatch && !lowerCmd.includes("whatsapp")) {
    const number = callMatch[1].replace(/\s+/g, "");
    return {
      action: `Opening your dialer for ${number}. Dialing...`,
      url: `tel:${number}`,
      isBrowserAction: true,
    };
  }

  // SMS: "Send SMS to [number] saying [message]"
  const smsMatch = lowerCmd.match(/^(?:send\s+)?sms\s+(?:to\s+)?([\d\+\s]+)\s+(?:saying|that|is|message)\s+(.+)$/);
  if (smsMatch) {
    const number = smsMatch[1].replace(/\s+/g, "");
    const message = encodeURIComponent(smsMatch[2].trim());
    return {
      action: `Drafting an SMS for you, Sheraz. Just hit send!`,
      url: `sms:${number}?body=${message}`,
      isBrowserAction: true,
    };
  }

  // Google Maps: "Take me to [place]"
  const mapsMatch = lowerCmd.match(/^(?:take\s+me\s+to|directions\s+to|navigate\s+to)\s+(.+)$/);
  if (mapsMatch) {
    const destination = encodeURIComponent(mapsMatch[1].trim());
    return {
      action: `Finding the way to ${mapsMatch[1]}. Rasta saaf hai, chaliye!`,
      url: `https://www.google.com/maps/search/?api=1&query=${destination}`,
      isBrowserAction: true,
    };
  }

  // Search: "Search for [query] on Google/YouTube"
  const searchMatch = lowerCmd.match(/^search\s+(?:for\s+)?(.+?)(?:\s+on\s+(google|youtube))?$/);
  if (searchMatch) {
    const query = encodeURIComponent(searchMatch[1].trim());
    const platform = searchMatch[2] === "youtube" ? "youtube" : "google";
    const url = platform === "youtube" 
      ? `https://www.youtube.com/results?search_query=${query}` 
      : `https://www.google.com/search?q=${query}`;
    
    return {
      action: `Searching for "${searchMatch[1]}" on ${platform}. Dekhiye kya milta hai!`,
      url: url,
      isBrowserAction: true,
    };
  }

  return { action: "", isBrowserAction: false };
}
