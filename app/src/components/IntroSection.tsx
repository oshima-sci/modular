import { AccordionTrigger, Accordion, AccordionContent, AccordionItem } from "./ui/accordion"

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
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    )
}