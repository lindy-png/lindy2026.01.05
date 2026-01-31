import { ApifyClient } from 'apify-client';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Apify client
const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN
});

// Initialize Anthropic Claude
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Lindy's profile data for comparison
const lindyProfile = {
    skills: [
        'AI agent architecture', 'Prompt engineering', 'Multi-agent workflows',
        'LLM evaluation and testing', 'Voice AI', 'API integrations',
        'Enterprise sales', 'MEDDICC', 'SANDLER', 'BANT', 'Challenger Sale',
        'Solution engineering', 'ICP development', 'Pricing and packaging',
        'Sales playbook creation', '0 to 1 vertical building'
    ],
    interests: ['Sauna', 'Hiking', 'Pilates', 'Running', 'Podcasts'],
    location: 'San Francisco',
    industry: 'AI/SaaS',
    companies: ['Lindy', 'Teamflow', 'Cintas']
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    // Check for required API keys
    if (!process.env.APIFY_API_TOKEN) {
        console.error('APIFY_API_TOKEN is not set');
        return res.status(500).json({ error: 'Server configuration error: Apify API token missing' });
    }
    
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error('ANTHROPIC_API_KEY is not set');
        return res.status(500).json({ error: 'Server configuration error: Anthropic API key missing' });
    }
    
    try {
        let profileData;
        
        // Determine if LinkedIn or Twitter
        if (url.includes('linkedin.com')) {
            console.log('Scraping LinkedIn profile:', url);
            try {
                profileData = await scrapeLinkedIn(url);
                console.log('LinkedIn profile scraped successfully:', profileData.name || 'Unknown');
            } catch (scrapeError) {
                console.error('LinkedIn scraping failed:', scrapeError.message);
                // Even if scraping fails, try to extract basic info from URL and proceed
                const username = url.match(/linkedin\.com\/in\/([^\/\?]+)/)?.[1];
                profileData = {
                    name: username || 'Unknown',
                    headline: '',
                    location: '',
                    skills: [],
                    experiences: [],
                    summary: `LinkedIn profile: ${url}`
                };
                console.log('Using fallback profile data due to scraping error');
            }
        } else if (url.includes('twitter.com') || url.includes('x.com')) {
            console.log('Scraping Twitter profile:', url);
            try {
                profileData = await scrapeTwitter(url);
                console.log('Twitter profile scraped successfully:', profileData.name || 'Unknown');
            } catch (scrapeError) {
                console.error('Twitter scraping failed:', scrapeError.message);
                // Even if scraping fails, try to extract basic info from URL and proceed
                const username = url.match(/(?:twitter\.com\/|x\.com\/)([^\/\?]+)/)?.[1];
                profileData = {
                    name: username || 'Unknown',
                    headline: '',
                    location: '',
                    tweets: `Twitter profile: ${url}`
                };
                console.log('Using fallback profile data due to scraping error');
            }
        } else {
            return res.status(400).json({ error: 'Please provide a LinkedIn or Twitter URL' });
        }
        
        // Compare profiles using LLM - ALWAYS call this even if scraping had issues
        console.log('Calling Anthropic API to compare profiles...');
        console.log('User profile data:', JSON.stringify(profileData, null, 2));
        
        const comparison = await compareProfiles(profileData, lindyProfile);
        console.log('Anthropic comparison complete:', comparison.points?.length || 0, 'points found');
        console.log('Comparison result:', JSON.stringify(comparison, null, 2));
        
        // Ensure we always return points
        if (!comparison.points || comparison.points.length === 0) {
            console.error('WARNING: No points in comparison result!');
            comparison.points = ['Unable to generate comparison at this time. Please try again.'];
        }
        
        res.json({
            points: comparison.points
        });
    } catch (error) {
        console.error('Error in compare handler:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: error.message || 'Failed to process profile comparison' });
    }
}

async function scrapeLinkedIn(profileUrl) {
    try {
        console.log('Starting LinkedIn scrape for:', profileUrl);
        
        // Try multiple LinkedIn actors with different input formats
        const actorsToTry = [
            {
                id: '2SyF0bVxmgGr8IVCZ',
                input: { startUrls: [{ url: profileUrl }] }
            },
            {
                id: 'dev_fusion/Linkedin-Profile-Scraper',
                input: { profileUrls: [profileUrl] }
            },
            {
                id: 'apify/linkedin-profile-scraper',
                input: { profileUrls: [profileUrl] }
            },
            {
                id: 'dtrungtin/linkedin-profile-scraper',
                input: { profileUrls: [profileUrl] }
            }
        ];
        
        let lastError;
        for (const actorConfig of actorsToTry) {
            try {
                console.log(`Trying actor: ${actorConfig.id}`);
                console.log('Input:', JSON.stringify(actorConfig.input, null, 2));
                
                // Start the actor run
                const run = await client.actor(actorConfig.id).call(actorConfig.input);
                console.log(`Actor ${actorConfig.id} started, run ID: ${run.id}`);
                
                // Wait for the run to finish (with timeout)
                let finished = false;
                let attempts = 0;
                const maxAttempts = 60; // 5 minutes max (5s * 60)
                
                while (!finished && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                    const runStatus = await client.run(run.id).get();
                    console.log(`Run status (attempt ${attempts + 1}):`, runStatus.status);
                    
                    if (runStatus.status === 'SUCCEEDED') {
                        finished = true;
                    } else if (runStatus.status === 'FAILED' || runStatus.status === 'ABORTED') {
                        throw new Error(`Actor run ${runStatus.status}: ${runStatus.statusMessage || 'Unknown error'}`);
                    }
                    attempts++;
                }
                
                if (!finished) {
                    throw new Error('Actor run timed out after 5 minutes');
                }
                
                // Get the results
                const { items } = await client.dataset(run.defaultDatasetId).listItems();
                console.log(`Got ${items.length} items from actor ${actorConfig.id}`);
                
                if (items.length === 0) {
                    console.log(`No items returned from ${actorConfig.id}, trying next actor...`);
                    continue;
                }
                
                const profile = items[0];
                console.log('Profile data received:', Object.keys(profile));
                
                // Extract profile data with multiple fallback options
                const extractedProfile = {
                    name: profile.fullName || profile.name || 
                          (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : '') ||
                          profile.profileName || '',
                    headline: profile.headline || profile.headlineText || profile.summary || '',
                    location: profile.location || profile.locationName || profile.geoLocation || '',
                    skills: (profile.skills || []).map(s => 
                        typeof s === 'string' ? s : (s.name || s.title || s.text || s)
                    ),
                    experiences: (profile.experiences || profile.positions || profile.workExperience || []).map(e => ({
                        company: e.companyName || e.company || e.companyNameLocalized || '',
                        title: e.title || e.positionTitle || e.role || ''
                    })),
                    education: profile.education || profile.schools || [],
                    summary: profile.summary || profile.about || profile.description || ''
                };
                
                console.log('Successfully extracted profile:', extractedProfile.name);
                return extractedProfile;
                
            } catch (error) {
                console.error(`Actor ${actorConfig.id} failed:`, error.message);
                lastError = error;
                continue; // Try next actor
            }
        }
        
        // All actors failed
        throw new Error(`All LinkedIn scrapers failed. Last error: ${lastError?.message || 'No actors available'}. Please check your Apify account has access to LinkedIn scrapers.`);
    } catch (error) {
        console.error('LinkedIn scraping error:', error);
        throw new Error(`LinkedIn scraping failed: ${error.message}`);
    }
}

async function scrapeTwitter(profileUrl) {
    try {
        console.log('Starting Twitter scrape for:', profileUrl);
        
        // Extract username from URL
        const username = profileUrl.match(/(?:twitter\.com\/|x\.com\/)([^\/\?]+)/)?.[1];
        
        if (!username) {
            throw new Error('Invalid Twitter URL');
        }
        
        // Try multiple Twitter actors
        const actorsToTry = [
            {
                id: 'apify/twitter-scraper',
                input: {
                    startUrls: [{ url: `https://twitter.com/${username}` }],
                    maxTweets: 50,
                    addUserInfo: true
                }
            },
            {
                id: 'quacker/twitter-scraper',
                input: {
                    profiles: [username],
                    maxTweets: 50
                }
            }
        ];
        
        let lastError;
        for (const actorConfig of actorsToTry) {
            try {
                console.log(`Trying Twitter actor: ${actorConfig.id}`);
                console.log('Input:', JSON.stringify(actorConfig.input, null, 2));
                
                // Start the actor run
                const run = await client.actor(actorConfig.id).call(actorConfig.input);
                console.log(`Twitter actor ${actorConfig.id} started, run ID: ${run.id}`);
                
                // Wait for the run to finish (with timeout)
                let finished = false;
                let attempts = 0;
                const maxAttempts = 60; // 5 minutes max
                
                while (!finished && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                    const runStatus = await client.run(run.id).get();
                    console.log(`Twitter run status (attempt ${attempts + 1}):`, runStatus.status);
                    
                    if (runStatus.status === 'SUCCEEDED') {
                        finished = true;
                    } else if (runStatus.status === 'FAILED' || runStatus.status === 'ABORTED') {
                        throw new Error(`Twitter actor run ${runStatus.status}: ${runStatus.statusMessage || 'Unknown error'}`);
                    }
                    attempts++;
                }
                
                if (!finished) {
                    throw new Error('Twitter actor run timed out after 5 minutes');
                }
                
                // Get the results
                const { items } = await client.dataset(run.defaultDatasetId).listItems();
                console.log(`Got ${items.length} items from Twitter actor ${actorConfig.id}`);
                
                if (items.length === 0) {
                    console.log(`No items returned from ${actorConfig.id}, trying next actor...`);
                    continue;
                }
                
                // Find user info and tweets
                const userInfo = items.find(item => item.type === 'User' || item.user || item.isUser);
                const tweets = items.filter(item => 
                    item.type === 'Tweet' || 
                    item.text || 
                    item.fullText ||
                    (item.retweetedStatus && item.retweetedStatus.text)
                );
                
                console.log('User info found:', !!userInfo);
                console.log('Tweets found:', tweets.length);
                
                return {
                    name: userInfo?.name || userInfo?.user?.name || userInfo?.displayName || username,
                    headline: userInfo?.bio || userInfo?.description || userInfo?.user?.description || '',
                    location: userInfo?.location || userInfo?.user?.location || '',
                    tweets: tweets.map(t => t.text || t.fullText || t.retweetedStatus?.text || '').filter(Boolean).join(' ')
                };
                
            } catch (error) {
                console.error(`Twitter actor ${actorConfig.id} failed:`, error.message);
                lastError = error;
                continue; // Try next actor
            }
        }
        
        // All actors failed
        throw new Error(`All Twitter scrapers failed. Last error: ${lastError?.message || 'No actors available'}`);
    } catch (error) {
        console.error('Twitter scraping error:', error);
        throw new Error(`Twitter scraping failed: ${error.message}`);
    }
}

async function compareProfiles(userProfile, lindyProfile) {
    try {
        console.log('=== STARTING ANTHROPIC API CALL ===');
        console.log('Anthropic API Key present:', !!process.env.ANTHROPIC_API_KEY);
        console.log('Anthropic API Key length:', process.env.ANTHROPIC_API_KEY?.length || 0);
        
        // Validate we have some profile data
        if (!userProfile || (!userProfile.name && !userProfile.headline && !userProfile.summary)) {
            console.error('Invalid user profile data:', userProfile);
            return {
                points: ['Unable to extract profile information. Please ensure the URL is correct and try again.']
            };
        }
        
        // Format profiles for LLM
        const userProfileText = `
Name: ${userProfile.name || 'Unknown'}
Headline: ${userProfile.headline || ''}
Location: ${userProfile.location || ''}
Skills: ${(userProfile.skills || []).join(', ') || 'Not specified'}
Experience: ${(userProfile.experiences || []).map(e => `${e.title || ''} at ${e.company || ''}`).join('; ') || 'Not specified'}
Summary: ${userProfile.summary || userProfile.bio || userProfile.tweets || 'Not specified'}
`;

        const lindyProfileText = `
Name: Lindy Drope
Headline: Founding team at Lindy. Leading the sales org. Building the future of work with AI.
Location: San Francisco, CA
Skills: ${lindyProfile.skills.join(', ')}
Experience: Head of Sales at Lindy (2023-Present), Account Executive at Teamflow (2022-2023), Enterprise Account Executive at Cintas (2020-2022)
Interests: ${lindyProfile.interests.join(', ')}
Summary: Founding GTM hire at Lindy, an AI assistant platform. Acquired 500+ customers, built healthcare vertical from zero to $1M in revenue. Closed $4M+ in total revenue. Built and deployed 80+ AI agents.
`;

        const prompt = `You are analyzing two professional profiles to find meaningful connections. Be insightful, specific, and conversational.

User Profile:
${userProfileText}

Lindy's Profile:
${lindyProfileText}

Analyze these profiles and provide EXACTLY 3-4 bullet points that highlight either:
- Common ground (shared skills, experiences, interests, industry, location, career paths, values, etc.)
- OR interesting contrasting differences that could spark conversation

Prioritize commonalities if they exist. If there are no clear commonalities, focus on interesting differences that show complementary perspectives or conversation starters.

Be specific and actionable. Don't say "both in tech" - say "both building AI products" or "both in enterprise SaaS sales".

Format your response as JSON with a single "points" array containing exactly 3-4 items:
{
  "points": ["bullet point 1", "bullet point 2", "bullet point 3", "bullet point 4"]
}

Each point should be a complete, standalone sentence that's insightful and specific.`;

        console.log('Calling anthropic.messages.create...');
        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });
        console.log('Anthropic API call successful! Response received.');

        // Parse LLM response
        const responseText = message.content[0].text;
        
        // Try to extract JSON from response
        let comparison;
        try {
            // Look for JSON in the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                comparison = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            // Fallback: try to extract bullet points from text
            console.error('Failed to parse LLM JSON:', parseError, responseText);
            
            // Look for bullet points or numbered list
            const bulletMatches = responseText.match(/(?:^|\n)[•\-\*]\s*(.+?)(?=\n|$)/g);
            const numberedMatches = responseText.match(/(?:^|\n)\d+[\.\)]\s*(.+?)(?=\n|$)/g);
            
            let points = [];
            if (bulletMatches) {
                points = bulletMatches.map(m => m.replace(/^[\n\s]*[•\-\*]\s*/, '').trim()).filter(p => p);
            } else if (numberedMatches) {
                points = numberedMatches.map(m => m.replace(/^[\n\s]*\d+[\.\)]\s*/, '').trim()).filter(p => p);
            }
            
            // If we found points, use them; otherwise create fallback
            if (points.length > 0) {
                comparison = { points: points.slice(0, 4) }; // Limit to 4
            } else {
                // Try to extract from "points" array in text
                const pointsMatch = responseText.match(/points?[:\-]?\s*\[?([^\]]+)\]?/i);
                if (pointsMatch) {
                    points = pointsMatch[1].split(',').map(s => s.trim().replace(/["']/g, '')).filter(s => s);
                    comparison = { points: points.slice(0, 4) };
                } else {
                    throw new Error('Could not extract points from response');
                }
            }
        }

        // Ensure we have 3-4 points
        let points = comparison.points || [];
        if (points.length === 0) {
            console.error('No points found in comparison, response was:', responseText);
            // Try to generate a fallback based on available data
            points = [
                'Both profiles are being analyzed for connections',
                'Looking for shared professional experiences or interests',
                'Exploring potential conversation starters'
            ];
        } else if (points.length > 4) {
            points = points.slice(0, 4);
        }

        console.log('Returning points:', points);
        return {
            points: points
        };
    } catch (error) {
        console.error('LLM comparison error:', error);
        // Fallback to basic comparison if LLM fails
        return {
            points: ['Unable to analyze profiles at the moment. Please try again!']
        };
    }
}
