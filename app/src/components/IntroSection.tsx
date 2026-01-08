import { AccordionTrigger, Accordion, AccordionContent, AccordionItem } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"

export default function IntroSection(){
    return(
        <Accordion type="single" collapsible defaultValue="" className="space-y-2">
            <AccordionItem value="intro">
                <AccordionTrigger>What is Modular?</AccordionTrigger>
                <AccordionContent className="space-y-2">
                    <p>
                        Modular is an experimental tool representing scientific knowledge as
                        graphs instead of papers. Modular extracts claims, methods and evidence
                        from scientific papers and analyzes them for possible epistemic connections.
                    </p>
                    <p>
                        Go from papers to interconnected graphs of knowledge. Identify pieces of evidence
                        related to a claim, whether the evidence was published in the same or an entirely
                        different paper. Find contradictions among claims, and guage the empirical support
                        across the literature for a given claim.
                    </p>
                    <a
                        href="https://oshimascience.com/#metascience"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-black"
                    >
                        <Button variant="outline" size="sm">
                            <ExternalLink/>
                            Learn more
                        </Button>
                    </a>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    )
}